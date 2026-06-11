// =============================================================================
//  SyncManager.cs — À coller dans Assets/Scripts/ d'un projet Unity Quest.
//  Dépendances : Newtonsoft.Json (Window → Package Manager → "com.unity.nuget.newtonsoft-json")
//  Cible : Android (Quest 2/3/Pro), API level 29+.
//
//  Usage minimal :
//      var sm = gameObject.AddComponent<SyncManager>();
//      sm.OnPairingCodeReady += (code) => uiText.text = "Code : " + code;
//      sm.OnSyncFinished     += (r) => Debug.Log($"Sync OK : {r.downloaded} dl, {r.failed} ko");
//      sm.Begin();
//
//  Le composant gère lui-même :
//   - 1er pairing (génère un code, attend que l'admin valide côté dashboard)
//   - Boucle de sync toutes les SyncIntervalMinutes
//   - Heartbeat toutes les HeartbeatIntervalMinutes
//   - Backoff exponentiel si offline
//   - Téléchargement des vidéos dans Application.persistentDataPath/videos/<id>.mp4
//   - Suppression des vidéos qui ne sont plus assignées
// =============================================================================
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;
using UnityEngine;
using UnityEngine.Networking;

public class SyncManager : MonoBehaviour
{
    // ⚙️  À adapter à ton projet Lovable Cloud :
    const string ProjectId = "eanocqzhvlpgppccfppi";
    const string AnonKey   = "sb_publishable_BG39aLgEbKIdusPcOHHcgg_ynDKu6aA";
    static string Base => $"https://{ProjectId}.supabase.co/functions/v1";

    public int SyncIntervalMinutes      = 5;
    public int HeartbeatIntervalMinutes = 5;
    public string AppVersion            = Application.version;

    // Événements UI
    public event Action<string> OnPairingCodeReady;   // affiche le code à l'utilisateur
    public event Action OnPairingClaimed;
    public event Action<SyncResult> OnSyncFinished;
    public event Action<string> OnError;

    string _deviceToken;
    string _pendingCode, _pendingSecret;
    string VideosDir => Path.Combine(Application.persistentDataPath, "videos");
    string TokenPath => Path.Combine(Application.persistentDataPath, "device_token.txt");

    // ---------------------------------------------------------------------- API
    public void Begin()
    {
        Directory.CreateDirectory(VideosDir);
        if (File.Exists(TokenPath)) _deviceToken = File.ReadAllText(TokenPath).Trim();
        StartCoroutine(MainLoop());
        StartCoroutine(HeartbeatLoop());
    }

    // ----------------------------------------------------------------- Pairing
    IEnumerator EnsurePaired()
    {
        if (!string.IsNullOrEmpty(_deviceToken)) yield break;

        // 1. init
        var initBody = JsonConvert.SerializeObject(new {
            serial = SystemInfo.deviceUniqueIdentifier,
            model  = SystemInfo.deviceModel
        });
        string initJson = null;
        yield return PostJson("/headset-pair-init", initBody, false, s => initJson = s);
        if (initJson == null) yield break;
        var init = JsonConvert.DeserializeObject<PairInitResp>(initJson);
        _pendingCode = init.code; _pendingSecret = init.pairing_secret;
        OnPairingCodeReady?.Invoke(init.code);

        // 2. poll toutes les 3 s pendant 10 min max
        var pollBody = JsonConvert.SerializeObject(new { code = init.code, pairing_secret = init.pairing_secret });
        var deadline = DateTime.UtcNow.AddMinutes(10);
        while (DateTime.UtcNow < deadline)
        {
            string pollJson = null;
            yield return PostJson("/headset-pair-poll", pollBody, false, s => pollJson = s);
            if (pollJson != null)
            {
                var p = JsonConvert.DeserializeObject<PairPollResp>(pollJson);
                if (p.status == "claimed")
                {
                    _deviceToken = p.device_token;
                    File.WriteAllText(TokenPath, _deviceToken);
                    OnPairingClaimed?.Invoke();
                    yield break;
                }
                if (p.status == "expired") { _deviceToken = null; yield break; }
            }
            yield return new WaitForSeconds(3f);
        }
    }

    // ---------------------------------------------------------------- Main loop
    IEnumerator MainLoop()
    {
        int attempt = 0;
        while (true)
        {
            yield return EnsurePaired();
            if (string.IsNullOrEmpty(_deviceToken)) { yield return new WaitForSeconds(10f); continue; }

            bool ok = false;
            yield return RunSync(r => ok = r);
            attempt = ok ? 0 : attempt + 1;
            float wait = ok ? SyncIntervalMinutes * 60f : Mathf.Min(7200f, 60f * Mathf.Pow(5, attempt - 1));
            yield return new WaitForSeconds(wait);
        }
    }

    IEnumerator RunSync(Action<bool> done)
    {
        // start report
        string startJson = null;
        yield return PostJson("/headset-report-sync", "{\"phase\":\"started\"}", true, s => startJson = s);
        if (startJson == null) { done(false); yield break; }
        var reportId = JsonConvert.DeserializeObject<ReportStartResp>(startJson).report_id;

        // manifest
        string manJson = null;
        yield return PostJson("/headset-manifest", "{}", true, s => manJson = s);
        if (manJson == null) { done(false); yield break; }
        var manifest = JsonConvert.DeserializeObject<Manifest>(manJson);

        // diff
        var wanted = new HashSet<string>();
        int downloaded = 0, failed = 0, deleted = 0;
        long bytes = 0;
        foreach (var v in manifest.videos)
        {
            wanted.Add(v.id);
            var dest = Path.Combine(VideosDir, v.id + "." + (v.format ?? "mp4"));
            if (File.Exists(dest) && new FileInfo(dest).Length == v.size_bytes) continue;
            bool dlOk = false;
            yield return DownloadFile(v.download_url, dest, ok => dlOk = ok);
            if (dlOk) { downloaded++; bytes += v.size_bytes; }
            else failed++;
        }
        // cleanup
        foreach (var f in Directory.GetFiles(VideosDir))
        {
            var id = Path.GetFileNameWithoutExtension(f);
            if (!wanted.Contains(id)) { try { File.Delete(f); deleted++; } catch {} }
        }

        var status = failed == 0 ? "success" : (downloaded > 0 ? "partial" : "failed");
        var finishBody = JsonConvert.SerializeObject(new {
            phase = "finished", report_id = reportId, status,
            downloaded_count = downloaded, failed_count = failed, deleted_count = deleted,
            total_bytes = bytes
        });
        yield return PostJson("/headset-report-sync", finishBody, true, _ => {});

        OnSyncFinished?.Invoke(new SyncResult { downloaded = downloaded, failed = failed, deleted = deleted });
        done(failed == 0);
    }

    // ------------------------------------------------------------- Heartbeat
    IEnumerator HeartbeatLoop()
    {
        while (true)
        {
            yield return new WaitForSeconds(HeartbeatIntervalMinutes * 60f);
            if (string.IsNullOrEmpty(_deviceToken)) continue;
            long total = 0, free = 0;
            try {
                var di = new DriveInfo(Application.persistentDataPath);
                total = di.TotalSize; free = di.AvailableFreeSpace;
            } catch {}
            var body = JsonConvert.SerializeObject(new {
                battery_percent    = Mathf.RoundToInt(SystemInfo.batteryLevel * 100f),
                storage_free_bytes = free,
                storage_total_bytes = total,
                app_version        = AppVersion
            });
            yield return PostJson("/headset-heartbeat", body, true, _ => {});
        }
    }

    // ------------------------------------------------------------------ HTTP
    IEnumerator PostJson(string path, string body, bool withDeviceToken, Action<string> onSuccess)
    {
        using var req = new UnityWebRequest(Base + path, "POST");
        req.uploadHandler   = new UploadHandlerRaw(System.Text.Encoding.UTF8.GetBytes(body));
        req.downloadHandler = new DownloadHandlerBuffer();
        req.SetRequestHeader("Content-Type", "application/json");
        req.SetRequestHeader("apikey", AnonKey);
        if (withDeviceToken) req.SetRequestHeader("Authorization", "Bearer " + _deviceToken);
        yield return req.SendWebRequest();

        if (req.responseCode == 401 || req.responseCode == 403 || req.responseCode == 404)
        {
            if (withDeviceToken) { // token mort → repasser en pairing
                _deviceToken = null; try { File.Delete(TokenPath); } catch {}
            }
            OnError?.Invoke($"{path}: HTTP {req.responseCode}");
            yield break;
        }
        if (req.result != UnityWebRequest.Result.Success) { OnError?.Invoke($"{path}: {req.error}"); yield break; }
        onSuccess(req.downloadHandler.text);
    }

    IEnumerator DownloadFile(string url, string dest, Action<bool> done)
    {
        var tmp = dest + ".part";
        using var req = UnityWebRequest.Get(url);
        req.downloadHandler = new DownloadHandlerFile(tmp) { removeFileOnAbort = true };
        yield return req.SendWebRequest();
        if (req.result != UnityWebRequest.Result.Success) { done(false); yield break; }
        try { if (File.Exists(dest)) File.Delete(dest); File.Move(tmp, dest); done(true); }
        catch { done(false); }
    }

    // ---------------------------------------------------------------- DTOs
    [Serializable] class PairInitResp { public string code; public string pairing_secret; public string expires_at; }
    [Serializable] class PairPollResp { public string status; public string device_token; public string headset_id; }
    [Serializable] class ReportStartResp { public string report_id; }
    [Serializable] class Manifest { public string headset_id; public int url_expires_in; public List<Video> videos; }
    [Serializable] public class Video { public string id; public string name; public long size_bytes; public int duration_seconds; public string format; public string download_url; }
    public class SyncResult { public int downloaded, failed, deleted; }
}