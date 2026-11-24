import json
import time
import uuid
import random
import threading
from typing import Dict, Any, List, Optional
import paho.mqtt.client as mqtt


BROKERS = [
    ("broker.emqx.io", 1883),
    ("test.mosquitto.org", 1883),
]


class LobbyManager:
    def __init__(self):
        self.client_id = f"osuroul_{uuid.uuid4().hex[:10]}"
        self.room_code: str = ""
        self.is_host: bool = False
        self.connected: bool = False
        self.player_name: str = "osu! Player"
        self.player_avatar: str = "https://assets.ppy.sh/favicon/favicon-32x32.png"

        self._mqtt: Optional[mqtt.Client] = None
        self._lock = threading.Lock()

        self.members: Dict[str, Dict[str, Any]] = {}
        self.latest_spin: Optional[Dict[str, Any]] = None
        self.round_scores: List[Dict[str, Any]] = []
        self.last_error: str = ""

    def _topic(self) -> str:
        return f"osu_roulette/v1/room/{self.room_code}"

    def set_player_info(self, name: str, avatar: str):
        if name:
            self.player_name = name
        if avatar:
            self.player_avatar = avatar

    def _connect_mqtt(self):
        self.disconnect_mqtt()
        self.last_error = ""

        client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id=self.client_id,
            protocol=mqtt.MQTTv311,
        )
        client.on_connect = self._on_connect
        client.on_message = self._on_message
        client.on_disconnect = self._on_disconnect

        for host, port in BROKERS:
            try:
                client.connect(host, port, keepalive=30)
                client.loop_start()
                self._mqtt = client
                # Wait briefly for on_connect
                for _ in range(30):
                    if self.connected:
                        return True
                    time.sleep(0.1)
                if self.connected:
                    return True
                client.loop_stop()
                client.disconnect()
            except Exception as e:
                self.last_error = str(e)
                continue
        return False

    def disconnect_mqtt(self):
        if self._mqtt:
            try:
                if self.room_code and self.connected:
                    self._publish({"type": "leave", "sender_id": self.client_id})
                self._mqtt.loop_stop()
                self._mqtt.disconnect()
            except Exception:
                pass
            self._mqtt = None
        self.connected = False

    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        if reason_code == 0:
            self.connected = True
            if self.room_code:
                client.subscribe(self._topic(), qos=1)
                self._publish({
                    "type": "join",
                    "sender_id": self.client_id,
                    "name": self.player_name,
                    "avatar": self.player_avatar,
                    "is_host": self.is_host,
                })
        else:
            self.last_error = f"MQTT connect code: {reason_code}"

    def _on_disconnect(self, client, userdata, disconnect_flags, reason_code, properties=None):
        self.connected = False

    def _on_message(self, client, userdata, msg):
        try:
            data = json.loads(msg.payload.decode("utf-8"))
        except Exception:
            return

        mtype = data.get("type")
        sender = data.get("sender_id", "")

        with self._lock:
            now = time.time()
            if mtype == "join":
                self.members[sender] = {
                    "id": sender,
                    "name": data.get("name", "Player"),
                    "avatar": data.get("avatar", ""),
                    "is_host": bool(data.get("is_host", False)),
                    "last_seen": now,
                }
                # Reply with presence so newcomer sees everyone
                if sender != self.client_id:
                    threading.Thread(
                        target=self._publish,
                        args=({
                            "type": "presence",
                            "sender_id": self.client_id,
                            "name": self.player_name,
                            "avatar": self.player_avatar,
                            "is_host": self.is_host,
                        },),
                        daemon=True,
                    ).start()

            elif mtype == "presence":
                self.members[sender] = {
                    "id": sender,
                    "name": data.get("name", "Player"),
                    "avatar": data.get("avatar", ""),
                    "is_host": bool(data.get("is_host", False)),
                    "last_seen": now,
                }

            elif mtype == "leave":
                self.members.pop(sender, None)

            elif mtype == "spin":
                self.latest_spin = data
                self.round_scores = []  # Reset leaderboard for new round

            elif mtype == "score":
                # Update or append score for sender
                entry = {
                    "sender_id": sender,
                    "name": data.get("name", "Player"),
                    "avatar": data.get("avatar", ""),
                    "rank": data.get("rank", "?"),
                    "accuracy": float(data.get("accuracy", 0.0)),
                    "misses": int(data.get("misses", 0)),
                    "pp": float(data.get("pp", 0.0)),
                    "score": int(data.get("score", 0)),
                    "passed": bool(data.get("passed", True)),
                    "timestamp": now,
                }
                self.round_scores = [s for s in self.round_scores if s["sender_id"] != sender]
                self.round_scores.append(entry)
                self.round_scores.sort(key=lambda x: (x["score"], x["accuracy"]), reverse=True)

    def _publish(self, payload: Dict[str, Any]):
        if self._mqtt and self.connected and self.room_code:
            try:
                self._mqtt.publish(self._topic(), json.dumps(payload, ensure_ascii=False), qos=1)
            except Exception:
                pass

    def create_room(self, name: str = "", avatar: str = "") -> Dict[str, Any]:
        self.set_player_info(name, avatar)
        code = f"OSU-{random.randint(1000, 9999)}"
        with self._lock:
            self.room_code = code
            self.is_host = True
            self.members = {
                self.client_id: {
                    "id": self.client_id,
                    "name": self.player_name,
                    "avatar": self.player_avatar,
                    "is_host": True,
                    "last_seen": time.time(),
                }
            }
            self.latest_spin = None
            self.round_scores = []

        ok = self._connect_mqtt()
        if not ok:
            self.room_code = ""
            return {"ok": False, "error": self.last_error or "Не удалось подключиться к брокеру"}
        return self.get_state()

    def join_room(self, code: str, name: str = "", avatar: str = "") -> Dict[str, Any]:
        clean_code = code.strip().upper()
        if not clean_code:
            return {"ok": False, "error": "Введите код комнаты"}
        self.set_player_info(name, avatar)
        with self._lock:
            self.room_code = clean_code
            self.is_host = False
            self.members = {
                self.client_id: {
                    "id": self.client_id,
                    "name": self.player_name,
                    "avatar": self.player_avatar,
                    "is_host": False,
                    "last_seen": time.time(),
                }
            }
            self.latest_spin = None
            self.round_scores = []

        ok = self._connect_mqtt()
        if not ok:
            self.room_code = ""
            return {"ok": False, "error": self.last_error or "Не удалось подключиться к комнате"}
        return self.get_state()

    def leave_room(self) -> Dict[str, Any]:
        self.disconnect_mqtt()
        with self._lock:
            self.room_code = ""
            self.is_host = False
            self.members = {}
            self.latest_spin = None
            self.round_scores = []
        return self.get_state()

    def broadcast_spin(self, spin_payload: Dict[str, Any]):
        if not self.room_code or not self.connected:
            return
        msg = {
            "type": "spin",
            "spin_id": uuid.uuid4().hex[:12],
            "sender_id": self.client_id,
            "host_name": self.player_name,
            **spin_payload,
        }
        with self._lock:
            self.latest_spin = msg
            self.round_scores = []
        self._publish(msg)

    def broadcast_score(self, score_data: Dict[str, Any]):
        if not self.room_code or not self.connected:
            return
        msg = {
            "type": "score",
            "sender_id": self.client_id,
            "name": self.player_name,
            "avatar": self.player_avatar,
            "rank": score_data.get("rank", "?"),
            "accuracy": score_data.get("accuracy", 0.0),
            "misses": score_data.get("misses", 0),
            "pp": score_data.get("pp", 0.0),
            "score": score_data.get("total_score", score_data.get("score", 0)),
            "passed": score_data.get("passed", True),
        }
        self._publish(msg)

    def get_state(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "ok": True,
                "in_room": bool(self.room_code),
                "room_code": self.room_code,
                "is_host": self.is_host,
                "connected": self.connected,
                "client_id": self.client_id,
                "members": list(self.members.values()),
                "latest_spin": self.latest_spin,
                "round_scores": list(self.round_scores),
                "error": self.last_error,
            }


lobby_manager = LobbyManager()
