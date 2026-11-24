using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Collections.Generic;
using Realms;

namespace RealmReader;

class Program
{
    static void Main(string[] args)
    {
        string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        string defaultRealm = Path.Combine(appData, "osu", "client.realm");

        if (args.Length > 0 && args[0] == "check_score")
        {
            // Mode: check score for beatmap
            // args: check_score <realm_path> <beatmap_id> <beatmap_hash> [since_timestamp_utc]
            string realmPath = args.Length > 1 && !string.IsNullOrWhiteSpace(args[1]) ? args[1] : defaultRealm;
            int targetId = args.Length > 2 && int.TryParse(args[2], out int id) ? id : 0;
            string targetHash = args.Length > 3 ? args[3].Trim() : "";
            DateTimeOffset sinceTime = DateTimeOffset.MinValue;
            if (args.Length > 4 && DateTimeOffset.TryParse(args[4], out var parsedTime))
            {
                sinceTime = parsedTime;
            }

            CheckScore(realmPath, targetId, targetHash, sinceTime);
            return;
        }

        if (args.Length > 0 && args[0] == "get_profile")
        {
            // Mode: read player profile & scores summary
            string realmPath = args.Length > 1 && !string.IsNullOrWhiteSpace(args[1]) ? args[1] : defaultRealm;
            GetProfile(realmPath);
            return;
        }

        if (args.Length > 0 && args[0] == "check_tilt")
        {
            // Mode: detect rapid consecutive fails/retries for anti-tilt
            string realmPath = args.Length > 1 && !string.IsNullOrWhiteSpace(args[1]) ? args[1] : defaultRealm;
            DateTimeOffset sinceTime = DateTimeOffset.UtcNow.AddMinutes(-5);
            if (args.Length > 2 && DateTimeOffset.TryParse(args[2], out var parsedTime))
            {
                sinceTime = parsedTime;
            }
            CheckTilt(realmPath, sinceTime);
            return;
        }

        // Default mode: export all beatmaps
        string exportRealmPath = args.Length > 0 && !string.IsNullOrWhiteSpace(args[0]) ? args[0] : defaultRealm;
        string outputPath = args.Length > 1 && !string.IsNullOrWhiteSpace(args[1]) ? args[1] : "";
        ExportBeatmaps(exportRealmPath, outputPath);
    }

    static void GetProfile(string realmPath)
    {
        Realm? realm = null;
        string? tempFile = null;

        try
        {
            try
            {
                var config = new RealmConfiguration(realmPath) { IsDynamic = true };
                realm = Realm.GetInstance(config);
            }
            catch
            {
                tempFile = Path.Combine(Path.GetTempPath(), $"osu_prof_{Guid.NewGuid():N}.realm");
                File.Copy(realmPath, tempFile, true);
                var config = new RealmConfiguration(tempFile) { IsDynamic = true };
                realm = Realm.GetInstance(config);
            }

            var scores = realm.DynamicApi.All("Score");
            string username = "osu! Player";
            int onlineId = 0;
            string countryCode = "";
            int totalScores = 0;
            int passedScores = 0;
            double maxPp = 0.0;
            int countSS = 0, countS = 0, countA = 0;

            foreach (var s in scores)
            {
                totalScores++;
                var dyn = s.DynamicApi;
                int rankInt = dyn.Get<int>("Rank");
                if (rankInt > 0) passedScores++;
                if (rankInt == 7 || rankInt == 8) countSS++;
                else if (rankInt == 5 || rankInt == 6) countS++;
                else if (rankInt == 4) countA++;

                var ppVal = dyn.Get<RealmValue>("PP");
                if (ppVal.Type == RealmValueType.Double)
                {
                    double p = (double)ppVal;
                    if (p > maxPp) maxPp = p;
                }

                if (onlineId == 0)
                {
                    try
                    {
                        var u = dyn.Get<IRealmObjectBase>("User");
                        if (u != null)
                        {
                            string uname = u.DynamicApi.Get<string>("Username") ?? "";
                            int uId = u.DynamicApi.Get<int>("OnlineID");
                            string cCode = u.DynamicApi.Get<string>("CountryCode") ?? "";
                            if (!string.IsNullOrEmpty(uname)) username = uname;
                            if (uId > 0) onlineId = uId;
                            if (!string.IsNullOrEmpty(cCode)) countryCode = cCode;
                        }
                    }
                    catch { }
                }
            }

            var result = new Dictionary<string, object?>
            {
                ["found"] = true,
                ["username"] = username,
                ["online_id"] = onlineId,
                ["avatar_url"] = onlineId > 0 ? $"https://a.ppy.sh/{onlineId}" : "https://assets.ppy.sh/favicon/favicon-32x32.png",
                ["country_code"] = countryCode,
                ["total_scores"] = totalScores,
                ["passed_scores"] = passedScores,
                ["max_pp"] = Math.Round(maxPp, 1),
                ["count_ss"] = countSS,
                ["count_s"] = countS,
                ["count_a"] = countA
            };

            Console.WriteLine(JsonSerializer.Serialize(result));
        }
        catch (Exception ex)
        {
            Console.WriteLine(JsonSerializer.Serialize(new Dictionary<string, object?>
            {
                ["found"] = false,
                ["username"] = "osu! Player",
                ["online_id"] = 0,
                ["avatar_url"] = "https://assets.ppy.sh/favicon/favicon-32x32.png",
                ["error"] = ex.Message
            }));
        }
        finally
        {
            realm?.Dispose();
            if (tempFile != null && File.Exists(tempFile))
            {
                try { File.Delete(tempFile); } catch { }
            }
        }
    }

    static void CheckScore(string realmPath, int targetId, string targetHash, DateTimeOffset sinceTime)
    {
        Realm? realm = null;
        string? tempFile = null;

        try
        {
            try
            {
                var config = new RealmConfiguration(realmPath) { IsDynamic = true };
                realm = Realm.GetInstance(config);
            }
            catch
            {
                tempFile = Path.Combine(Path.GetTempPath(), $"osu_score_check_{Guid.NewGuid():N}.realm");
                File.Copy(realmPath, tempFile, true);
                var config = new RealmConfiguration(tempFile) { IsDynamic = true };
                realm = Realm.GetInstance(config);
            }

            var scores = realm.DynamicApi.All("Score");
            var matchingScores = new List<Dictionary<string, object?>>();

            foreach (var s in scores)
            {
                var dyn = s.DynamicApi;

                int bOnlineId = 0;
                string bHash = "";
                var binfo = dyn.Get<IRealmObjectBase>("BeatmapInfo");
                if (binfo != null)
                {
                    bOnlineId = binfo.DynamicApi.Get<int>("OnlineID");
                    bHash = binfo.DynamicApi.Get<string>("Hash") ?? "";
                }

                string scoreHash = dyn.Get<string>("BeatmapHash") ?? "";

                bool isMatch = false;
                if (targetId > 0 && bOnlineId == targetId) isMatch = true;
                if (!string.IsNullOrEmpty(targetHash) && (bHash.Equals(targetHash, StringComparison.OrdinalIgnoreCase) || scoreHash.Equals(targetHash, StringComparison.OrdinalIgnoreCase))) isMatch = true;

                if (!isMatch) continue;

                var dateVal = dyn.Get<RealmValue>("Date");
                DateTimeOffset scoreDate = DateTimeOffset.MinValue;
                if (dateVal.Type == RealmValueType.Date)
                {
                    scoreDate = (DateTimeOffset)dateVal;
                }

                if (sinceTime > DateTimeOffset.MinValue && scoreDate < sinceTime)
                {
                    continue;
                }

                double acc = Math.Round(dyn.Get<double>("Accuracy") * 100.0, 2);
                int maxCombo = dyn.Get<int>("MaxCombo");
                var ppVal = dyn.Get<RealmValue>("PP");
                double pp = ppVal.Type == RealmValueType.Double ? Math.Round((double)ppVal, 1) : 0.0;
                int rankInt = dyn.Get<int>("Rank");
                int totalScore = dyn.Get<int>("TotalScore");
                string statsJson = dyn.Get<string>("Statistics") ?? "{}";

                int misses = 0;
                try
                {
                    using var doc = JsonDocument.Parse(statsJson);
                    if (doc.RootElement.TryGetProperty("miss", out var missProp))
                    {
                        misses = missProp.GetInt32();
                    }
                }
                catch { }

                string rankStr = rankInt switch
                {
                    7 or 8 => "SS",
                    5 or 6 => "S",
                    4 => "A",
                    3 => "B",
                    2 => "C",
                    1 => "D",
                    _ => "F"
                };

                matchingScores.Add(new Dictionary<string, object?>
                {
                    ["found"] = true,
                    ["passed"] = rankInt > 0,
                    ["rank"] = rankStr,
                    ["rank_int"] = rankInt,
                    ["accuracy"] = acc,
                    ["max_combo"] = maxCombo,
                    ["misses"] = misses,
                    ["pp"] = pp,
                    ["score"] = totalScore,
                    ["date"] = scoreDate.ToString("o")
                });
            }

            if (matchingScores.Count > 0)
            {
                var newest = matchingScores.OrderByDescending(x => x["date"] as string).First();
                Console.WriteLine(JsonSerializer.Serialize(newest));
            }
            else
            {
                Console.WriteLine("{\"found\":false}");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine(JsonSerializer.Serialize(new Dictionary<string, object?>
            {
                ["found"] = false,
                ["error"] = ex.Message
            }));
        }
        finally
        {
            realm?.Dispose();
            if (tempFile != null && File.Exists(tempFile))
            {
                try { File.Delete(tempFile); } catch { }
            }
        }
    }

    static void ExportBeatmaps(string realmPath, string outputPath)
    {
        if (!File.Exists(realmPath))
        {
            Console.Error.WriteLine($"File not found: {realmPath}");
            Environment.Exit(1);
        }

        string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        string filesDir = Path.Combine(appData, "osu", "files");

        Realm? realm = null;
        string? tempFile = null;

        try
        {
            try
            {
                var config = new RealmConfiguration(realmPath) { IsDynamic = true };
                realm = Realm.GetInstance(config);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[RealmReader] Locked or in-use by lazer ({ex.Message}), creating temp shadow copy...");
                tempFile = Path.Combine(Path.GetTempPath(), $"osu_reader_{Guid.NewGuid():N}.realm");
                File.Copy(realmPath, tempFile, true);
                var config = new RealmConfiguration(tempFile) { IsDynamic = true };
                realm = Realm.GetInstance(config);
            }

            var beatmaps = realm.DynamicApi.All("Beatmap");
            var result = new List<Dictionary<string, object?>>();

            foreach (var b in beatmaps)
            {
                try
                {
                    var dyn = b.DynamicApi;

                    var ruleset = dyn.Get<IRealmObjectBase>("Ruleset");
                    int rulesetId = ruleset != null ? ruleset.DynamicApi.Get<int>("OnlineID") : 0;
                    if (rulesetId != 0) continue; // osu!standard only

                    var meta = dyn.Get<IRealmObjectBase>("Metadata");
                    string title = meta != null ? (meta.DynamicApi.Get<string>("Title") ?? "Unknown Title") : "Unknown Title";
                    string titleUni = meta != null ? (meta.DynamicApi.Get<string>("TitleUnicode") ?? title) : title;
                    string artist = meta != null ? (meta.DynamicApi.Get<string>("Artist") ?? "Unknown Artist") : "Unknown Artist";
                    string artistUni = meta != null ? (meta.DynamicApi.Get<string>("ArtistUnicode") ?? artist) : artist;
                    
                    var author = meta != null ? meta.DynamicApi.Get<IRealmObjectBase>("Author") : null;
                    string creator = author != null ? (author.DynamicApi.Get<string>("Username") ?? "Unknown Mapper") : "Unknown Mapper";

                    string diffName = dyn.Get<string>("DifficultyName") ?? "Normal";
                    int onlineId = dyn.Get<int>("OnlineID");
                    double sr = Math.Round(dyn.Get<double>("StarRating"), 2);
                    double bpm = Math.Round(dyn.Get<double>("BPM"), 1);
                    double lengthMs = dyn.Get<double>("Length");
                    int totalLength = (int)Math.Round(lengthMs / 1000.0);
                    if (totalLength <= 0) totalLength = 120;

                    var set = dyn.Get<IRealmObjectBase>("BeatmapSet");
                    int setId = set != null ? set.DynamicApi.Get<int>("OnlineID") : 0;
                    bool deletePending = set != null && set.DynamicApi.Get<bool>("DeletePending");
                    if (deletePending) continue;

                    // Strict status determination
                    int statusInt = -2; // Default Graveyard
                    if (onlineId > 0 && setId > 0)
                    {
                        int setStatus = set != null ? set.DynamicApi.Get<int>("Status") : 0;
                        int diffStatus = dyn.Get<int>("Status");
                        statusInt = setStatus != 0 ? setStatus : diffStatus;
                    }

                    string statusStr = statusInt switch
                    {
                        1 => "Ranked",
                        2 => "Approved",
                        3 => "Qualified",
                        4 => "Loved",
                        -1 => "Pending",
                        0 => "Pending",
                        -2 => "Graveyard",
                        _ => "Graveyard"
                    };

                    var diff = dyn.Get<IRealmObjectBase>("Difficulty");
                    float cs = diff != null ? (float)Math.Round(diff.DynamicApi.Get<float>("CircleSize"), 1) : 4.0f;
                    float ar = diff != null ? (float)Math.Round(diff.DynamicApi.Get<float>("ApproachRate"), 1) : 9.0f;
                    float od = diff != null ? (float)Math.Round(diff.DynamicApi.Get<float>("OverallDifficulty"), 1) : 8.0f;
                    float hp = diff != null ? (float)Math.Round(diff.DynamicApi.Get<float>("DrainRate"), 1) : 5.0f;

                    string hash = dyn.Get<string>("Hash") ?? "";
                    string localPath = "";
                    if (!string.IsNullOrEmpty(hash) && hash.Length >= 2)
                    {
                        string candidate = Path.Combine(filesDir, hash.Substring(0, 1), hash.Substring(0, 2), hash);
                        if (File.Exists(candidate))
                        {
                            localPath = candidate;
                        }
                    }

                    string coverUrl = setId > 0 
                        ? $"https://assets.ppy.sh/beatmaps/{setId}/covers/cover.jpg" 
                        : "https://assets.ppy.sh/beatmaps/covers/cover.jpg";
                    string cardUrl = setId > 0 
                        ? $"https://assets.ppy.sh/beatmaps/{setId}/covers/card.jpg" 
                        : coverUrl;
                    string previewUrl = setId > 0 
                        ? $"https://b.ppy.sh/preview/{setId}.mp3" 
                        : "";

                    int finalBId = onlineId > 0 ? onlineId : Math.Abs(diffName.GetHashCode() ^ title.GetHashCode());

                    var item = new Dictionary<string, object?>
                    {
                        ["beatmap_id"] = finalBId,
                        ["beatmapset_id"] = setId,
                        ["title"] = title,
                        ["title_unicode"] = string.IsNullOrWhiteSpace(titleUni) ? title : titleUni,
                        ["artist"] = artist,
                        ["artist_unicode"] = string.IsNullOrWhiteSpace(artistUni) ? artist : artistUni,
                        ["creator"] = creator,
                        ["version"] = diffName,
                        ["difficulty_rating"] = sr,
                        ["bpm"] = bpm,
                        ["total_length"] = totalLength,
                        ["cs"] = cs,
                        ["ar"] = ar,
                        ["od"] = od,
                        ["hp"] = hp,
                        ["status"] = statusStr,
                        ["cover_url"] = coverUrl,
                        ["card_url"] = cardUrl,
                        ["preview_url"] = previewUrl,
                        ["download_url"] = "",
                        ["local_path"] = localPath,
                        ["hash"] = hash
                    };

                    result.Add(item);
                }
                catch
                {
                }
            }

            Console.WriteLine($"Successfully extracted {result.Count} osu!standard beatmaps from client.realm!");

            if (!string.IsNullOrWhiteSpace(outputPath))
            {
                var dir = Path.GetDirectoryName(outputPath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                var options = new JsonSerializerOptions { WriteIndented = false };
                string json = JsonSerializer.Serialize(result, options);
                File.WriteAllText(outputPath, json);
                Console.WriteLine($"Wrote beatmaps index to: {outputPath}");
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Fatal error: {ex.Message}");
            Environment.Exit(1);
        }
        finally
        {
            realm?.Dispose();
            if (tempFile != null && File.Exists(tempFile))
            {
                try { File.Delete(tempFile); } catch { }
            }
        }
    }

    static void CheckTilt(string realmPath, DateTimeOffset sinceTime)
    {
        Realm? realm = null;
        string? tempFile = null;

        try
        {
            try
            {
                var config = new RealmConfiguration(realmPath) { IsReadOnly = true, SchemaVersion = 51 };
                realm = Realm.GetInstance(config);
            }
            catch
            {
                tempFile = Path.Combine(Path.GetTempPath(), $"client_tilt_{Guid.NewGuid():N}.realm");
                File.Copy(realmPath, tempFile, true);
                var config = new RealmConfiguration(tempFile) { IsReadOnly = true, SchemaVersion = 51 };
                realm = Realm.GetInstance(config);
            }

            var recentScores = new List<(DateTimeOffset date, bool passed, int maxCombo)>();
            var scores = realm.DynamicApi.All("ScoreInfo");

            foreach (var s in scores)
            {
                try
                {
                    var dyn = s.DynamicApi;
                    var date = dyn.Get<DateTimeOffset>("Date");
                    if (date < sinceTime) continue;

                    bool passed = false;
                    try { passed = dyn.Get<bool>("Passed"); } catch { }
                    int rankVal = -1;
                    try { rankVal = dyn.Get<int>("Rank"); } catch { }
                    if (rankVal < 0 || rankVal >= 6) passed = false;

                    int maxCombo = 0;
                    try { maxCombo = dyn.Get<int>("MaxCombo"); } catch { }

                    recentScores.Add((date, passed, maxCombo));
                }
                catch { }
            }

            // Sort newest first
            recentScores.Sort((a, b) => b.date.CompareTo(a.date));

            int consecutiveFails = 0;
            foreach (var sc in recentScores)
            {
                if (!sc.passed)
                {
                    consecutiveFails++;
                }
                else
                {
                    break;
                }
            }

            var res = new Dictionary<string, object>
            {
                ["tilting"] = consecutiveFails >= 3,
                ["consecutive_fails"] = consecutiveFails,
                ["recent_count"] = recentScores.Count
            };
            Console.WriteLine(JsonSerializer.Serialize(res));
        }
        catch (Exception ex)
        {
            Console.WriteLine(JsonSerializer.Serialize(new Dictionary<string, object>
            {
                ["tilting"] = false,
                ["consecutive_fails"] = 0,
                ["error"] = ex.Message
            }));
        }
        finally
        {
            realm?.Dispose();
            if (tempFile != null && File.Exists(tempFile))
            {
                try { File.Delete(tempFile); } catch { }
            }
        }
    }
}
