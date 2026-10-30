# Work残量リング / 自動更新用リポジトリ（チャリラボとは独立）

**非公式のChrome拡張。** 5時間・週間利用枠とリセット時刻を表示し、任意でWindowsローカル監視へ送る。**Work自体を開始・再開する機能はない。**

初回提出版 **v1.4.0**（v1.3.0の表示・ブリッジを継承）。Chrome拡張の **GitHub Releasesからの自動更新** を追加した。更新の実ブラウザ適用は未検証。Windows監視・チャリラボ研究の動作は独立。

## 1. GitHubリポジトリを作る（初回だけ）

1. GitHubの `https://github.com/new` で、所有アカウント `kaitosakuya0831-create` に `work-usage-monitor` を作成する。**公開を選べば**認証トークン無しでReleasesの更新を確認できる。非公開では別の認証方式が必要で、この版のUpdaterは対応しない。
2. **README/.gitignore/LICENSEの自動初期化は選ばず**、空のリポジトリを作成。
3. このパッケージを `C:\WorkUsageMonitor` に展開して、そこでPowerShellを開き、Gitが利用可能なら以下を実行（認証はGit Credential Managerに任せる。パスワードやトークンを共有しない）。

```powershell
cd C:\WorkUsageMonitor
git init
git add .
git commit -m "Initial Work ring v1.4.0 and offline-tested updater"
git branch -M main
git remote add origin https://github.com/kaitosakuya0831-create/work-usage-monitor.git
git push -u origin main
```

4. GitHubのリポジトリ画面 → **Releases → Draft a new release** からタグ `v1.4.0` の正式リリースを公開し、パッケージの `dist` 内にある **`work-ring-extension.zip` と `SHA256SUMS.txt` の2個だけ**をアセットに添付する。
5. 自動更新プログラムは `https://api.github.com/repos/kaitosakuya0831-create/work-usage-monitor/releases/latest` から **最新の正式リリース**のみを確認する。公開前は `404` や「更新なし」になる。

このリポジトリに**認証Cookie・GitHubトークン・`%LOCALAPPDATA%\ChariLabQuotaBridge` の中身**を公開しないこと。公開リポジトリにソースコードが見えることを理解してから選んでください。

## 2. Windows PCへの初回インストール

1. `C:\WorkUsageMonitor` に展開。`extension\manifest.json` が存在することを確認。
2. PowerShellで次を実行してローカルブリッジのトークンを作る。

```powershell
cd C:\WorkUsageMonitor
py -3 bridge\quota_bridge.py --setup
py -3 bridge\quota_bridge.py --show-token
```

3. 現在のWindowsユーザーがログインするとブリッジが起動するタスクを作る。通常のRunnerに影響しない、別タスク。管理者権限は原則不要。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\windows\install_bridge_task.ps1
```

4. Chrome `chrome://extensions/` → デベロッパーモード → `C:\WorkUsageMonitor\extension` を「パッケージ化されていない拡張機能を読み込む」。旧拡張は重複しないよう無効化。
5. 拡張ポップアップでWindows監視をONにして、手順2のトークンを登録。
6. ChatGPTにログインしWork画面を表示。実際に自動取得した数値だけがWindowsに送信される（手動値は送らない）。
7. Chromeを開いていても、**表示されるChatGPTタブが閉じられる／休止されると利用枠取得が止まる可能性あり。**

## 3. GitHub更新を1時間ごとに確認（任意）

**まずは取得・内容の確認のみ**：

```powershell
py -3 windows\update_from_github.py --check
```

続いて自動更新を許可する場合：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\windows\install_update_task.ps1
```

これにより `WorkRing-GitHub-Extension-Update` というタスクが作成され、**Windowsの同じユーザーがログイン中**に約1時間ごと更新を確認する。GitHub最新正式Releaseがより新しいバージョンで、ZIPと同一ReleaseのSHA256SUMSが一致し、manifestが検証できた場合にだけ `extension` を置換する。旧版は `work-ring-backup-*` にバックアップされ、失敗時には戻す。

ブリッジが動いていると、Chrome拡張の背景処理が数分以内に新しい拡張ファイルの適用を試す。ただし、**動いているChatGPTタブ内のコンテンツスクリプトは新旧が混在し得るため、タブ更新が必要な場合がある**。進行中のWorkを中断させないため、ChatGPTタブ自体は強制再読み込みしない。

### 停止

```powershell
Unregister-ScheduledTask -TaskName 'WorkRing-GitHub-Extension-Update' -Confirm:$false
Unregister-ScheduledTask -TaskName 'WorkRing-Local-Quota-Bridge' -Confirm:$false
```

## 4. 更新版を自分で公開

GitHubに変更をpush → 必要な検証を実施 → `extension\manifest.json` のバージョンを上げる → 次を実行し、生成したZIP+SHA256SUMSをそのバージョンの新しいGitHub Releaseに添付。**Releaseを公開するとWindows側で更新対象になる**。公開前に不正な権限・送信先がないか必ずコードを確認する。

```powershell
py -3 scripts\build_release.py
py -3 -m unittest discover -s tests -v
py -3 -m unittest discover -s bridge-tests -v
node extension\tests\background.test.js
node extension\tests\quota-snapshot.test.js
node extension\tests\reset-countdown.test.js
node extension\tests\usage-api.test.js
```

## 安全性・限界

- ChatGPT内部の非公開使用状況APIを利用しており、APIやDOMの変更で動かなくなる可能性がある。OpenAIの公式提供・保証ではない。
- 自動更新は公開GitHub ReleaseのZIPとチェックサムを比較するが、**同じGitHubアカウントが侵害された場合の悪意ある配布を防ぐ電子署名ではない**。GitHubアカウントに2段階認証を設定し、Release公開権限を慎重に管理すること。
- `chrome.runtime.reload()` は拡張機能の再読込であり、Workを起動する操作ではない。自動的なWork起動・スケジュール連携は未実装。
- Chromeタブ表示、Windowsログオン、スリープ解除、通信成功などが継続監視の前提。
- 更新プログラムは拡張機能のみを対象とする。**ブリッジやUpdater自体の自動更新は未対応**（重要なバックエンド修正は手動導入）。
- デモ回復hookは既定OFF。勝手に本番チャリラボのRunner、予測、資金管理、DBへ変更を加えない。
- GitHub Actionsや有料サービスは使用せず、Windows標準タスクスケジューラ・Python標準ライブラリで動く。
