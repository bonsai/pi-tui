// ~/pi-tui/extensions/lmstudio/index.js
//
// LM Studio 連携の本体。pi 本体 (~/.pi/agent) から分離しており、
// このファイルは git (bonsai/pi-tui) が原本。実体は
//   bin/lmstudio.sh on   : ~/.pi/agent/extensions/lmstudio へ symlink で装着
//   bin/lmstudio.sh off  : symlink を除去して取り外し
// で着脱する。外している間は pi 起動時に LM Studio へ fetch しない。
//
// 動作: 起動時にローカル LM Studio サーバーのロード済みモデルを動的登録する。
// これで "empty models" 問題を解決する: LM Studio でモデルをロードして
// (サーバーも起動して) おけば、pi を次回起動した時点で拾う。
// models.json の手編集は不要。
//
// サーバーは pi 起動より先に動いている必要がある。~/lmstudio-serve.ps1 か、
// LM Studio の Developer タブ > Start Server で起動しておく。

const LM_STUDIO_BASE_URL =
  process.env.LM_STUDIO_BASE_URL || "http://localhost:1234/v1";

export default async function (pi) {
  try {
    const res = await fetch(`${LM_STUDIO_BASE_URL}/models`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();

    const models = (payload.data || []).map((m) => ({
      id: m.id,
      name: m.id,
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 16384,
    }));

    if (models.length === 0) {
      console.warn(
        "[lmstudio] LM Studio server is up but no model is loaded. " +
          "Load a model in LM Studio, then restart pi."
      );
      return;
    }

    pi.registerProvider("lmstudio", {
      name: "LM Studio",
      baseUrl: LM_STUDIO_BASE_URL,
      // LM Studio ignores the key; pi still requires one for custom providers.
      apiKey: "lm-studio",
      api: "openai-completions",
      models,
    });

    console.log(`[lmstudio] Registered ${models.length} model(s).`);
  } catch (err) {
    console.warn(
      `[lmstudio] Could not reach LM Studio at ${LM_STUDIO_BASE_URL} ` +
        `(${err.message}). Start the server (Developer > Start Server) ` +
        `and restart pi.`
    );
  }
}