import { DEFAULT_SETTINGS } from './defaultSettings.generated';

// src/config/applyDefaultSettings.ts
// 把二开默认设置写进 localStorage —— **只补缺失的 key，绝不覆盖已有值**。
//
// 为什么是「只补」而不是「整份覆盖」：已装机用户的 localStorage 里已经是他自己调过的值，
// 整份覆盖等于每次升级都把用户设置打回出厂。全新的安装里 localStorage 是空的，
// 补齐之后拿到的就是这套默认值，两者因此可以共存于同一份代码。
//
// 为什么必须早于一切 store：这些 key 是各 store 的 fallback 输入
// （见 src/stores/storagePrimitives.ts 的 getStoredBoolean/getStoredString）。
// 本模块在 src/index.tsx 里是**第一个 import**，静态 import 的求值顺序保证它先于
// bootstrap() 与任何 store 模块执行，晚一步就会有一批设置读到 fallback 而不是默认值。
//
// 凭证不在这里：生成器已经把疑似凭证的 key 剔除了，这里只剩纯偏好。

/**
 * 写入缺失的默认设置。返回实际写入的 key 名列表（便于调试与测试）。
 * 单个 key 写失败（配额等）不影响其余 key。
 */
export const applyDefaultSettings = (): string[] => {
  if (typeof localStorage === 'undefined') return [];

  const written: string[] = [];

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    try {
      if (localStorage.getItem(key) !== null) continue;
      localStorage.setItem(key, value);
      written.push(key);
    } catch {
      // 写不进去就跳过：默认值是锦上添花，失败不该让整个 App 起不来
    }
  }

  return written;
};

applyDefaultSettings();
