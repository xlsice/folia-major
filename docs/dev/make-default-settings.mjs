// 当前文件：从真机 localStorage dump 生成 APK/桌面的默认设置模块（凭证已剔除）。
//
// 用法：
//   node docs/dev/make-default-settings.mjs docs/dev/.tmp/device-localstorage.json
//
// 前置（导出 dump）：
//   adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
//   node docs/dev/.tmp/dump-localstorage.mjs docs/dev/.tmp/device-localstorage.json
//
// 设计：这份文件是**生成物**，不要手改 —— 改了下次重新生成会被覆盖。
// 运行时逻辑在 src/config/applyDefaultSettings.ts，它只补 localStorage 里「缺失」的 key，
// 所以已装机用户不会被覆盖，只有全新安装才吃到这套默认值。

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { argv } from 'node:process';

const DUMP = argv[2] ?? 'docs/dev/.tmp/device-localstorage.json';
const OUT = 'src/config/defaultSettings.generated.ts';

// —— 剔除规则 1：任何疑似凭证的 key ——
// 命中即剔除，且**永不打印其值**（只打印 key 名）。
// 覆盖 services/onlineMusic/providerStorage.ts 的命名空间写法与历史遗留写法。
const CREDENTIAL_KEY_PATTERN = /cookie|token|password|secret|credential|userid|dfid|session[_-]?id/i;

// —— 剔除规则 2：瞬时状态 / 遥测，不是「设置」 ——
// 这些值描述的是「上次离开时在哪」，seed 进去只会让新安装莫名其妙地继承旧状态。
const TRANSIENT_EXACT_KEYS = new Set([
  'folia_local_music_last_row', // 列表滚动位置
  'folia_settings_last_section', // 设置页停在哪一节
  'last_app_view', // 上次打开的是哪个界面 —— 真机实测：App 启动后会自己改写它，默认值留在这里是死数据
  'wall_tools_queue_island_open', // 悬浮岛开合态
  'command_palette_frequency_v1', // 命令面板使用频次（遥测）
  'command_palette_recent_functional_v1', // 命令面板最近使用（遥测）
]);

const dump = JSON.parse(readFileSync(DUMP, 'utf8'));
const allKeys = Object.keys(dump.keys ?? {});

const kept = {};
const dropped = [];

for (const key of allKeys.sort()) {
  const value = dump.keys[key];
  if (typeof value !== 'string') {
    dropped.push({ key, why: 'non-string' });
    continue;
  }
  if (CREDENTIAL_KEY_PATTERN.test(key)) {
    dropped.push({ key, why: 'credential' });
    continue;
  }
  if (TRANSIENT_EXACT_KEYS.has(key)) {
    dropped.push({ key, why: 'transient' });
    continue;
  }
  kept[key] = value;
}

// —— 安全闸：生成前再扫一遍产出，命中凭证特征就中止，不落盘 ——
for (const key of Object.keys(kept)) {
  if (CREDENTIAL_KEY_PATTERN.test(key)) {
    console.error(`✗ 生成中止：产物里仍存在疑似凭证的 key "${key}"`);
    process.exit(1);
  }
}

const body = Object.entries(kept)
  .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
  .join('\n');

const header = `// 当前文件：**生成物**，请勿手改。
//
// 由 docs/dev/make-default-settings.mjs 从真机 localStorage dump 生成。
// 采集时间：${dump.dumpedAt ?? 'unknown'}
// 采集来源：${dump.origin ?? 'unknown'}
//
// 收录 ${Object.keys(kept).length} 项设置；已剔除凭证 ${dropped.filter((d) => d.why === 'credential').length} 项、瞬时状态/遥测 ${dropped.filter((d) => d.why === 'transient').length} 项。
// 剔除明细见 docs/dev/DEFAULT-SETTINGS.md。
//
// 生效方式见 src/config/applyDefaultSettings.ts：只补 localStorage 里缺失的 key。

/** 二开默认设置：键值对原样写入 localStorage。 */
export const DEFAULT_SETTINGS: Readonly<Record<string, string>> = Object.freeze({
${body}
});
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, header, 'utf8');

console.log(`dump keys     ${allKeys.length}`);
console.log(`seeded        ${Object.keys(kept).length}`);
console.log(`dropped       ${dropped.length}`);
for (const { key, why } of dropped) console.log(`  - ${key}  (${why})`);
console.log(`written       ${OUT}`);
