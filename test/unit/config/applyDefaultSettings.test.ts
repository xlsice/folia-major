import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../src/config/defaultSettings.generated';
import { applyDefaultSettings } from '../../../src/config/applyDefaultSettings';

// test/unit/config/applyDefaultSettings.test.ts
// 二开默认设置的落盘规则：只补缺失、不覆盖已有，且凭证永远不该出现在这份数据里。

// 单测跑在 node 环境里，没有 localStorage。自己搭一个带抛错能力的桩。
const createStorage = (initial: Record<string, string> = {}) => {
    const values = new Map(Object.entries(initial));
    const failOn = new Set<string>();
    return {
        values,
        failOn,
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
            if (failOn.has(key)) throw new Error('QuotaExceededError');
            values.set(key, value);
        },
    };
};

let storage: ReturnType<typeof createStorage>;

describe('applyDefaultSettings', () => {
    beforeEach(() => {
        storage = createStorage();
        vi.stubGlobal('localStorage', storage);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('全新安装时写入全部默认设置', () => {
        const written = applyDefaultSettings();

        expect(written.length).toBe(Object.keys(DEFAULT_SETTINGS).length);
        expect(storage.values.size).toBe(Object.keys(DEFAULT_SETTINGS).length);
        expect(storage.getItem('visualizer_mode')).toBe(DEFAULT_SETTINGS.visualizer_mode);
    });

    it('已有设置不被覆盖，只补缺失的 key', () => {
        storage.setItem('visualizer_mode', 'classic');
        const missing = Object.keys(DEFAULT_SETTINGS).filter((k) => k !== 'visualizer_mode');

        const written = applyDefaultSettings();

        expect(storage.getItem('visualizer_mode')).toBe('classic');
        expect(written).not.toContain('visualizer_mode');
        expect(written.sort()).toEqual(missing.sort());
    });

    it('重复执行是幂等的，第二次不写任何东西', () => {
        applyDefaultSettings();
        const before = new Map(storage.values);

        expect(applyDefaultSettings()).toEqual([]);
        expect(storage.values).toEqual(before);
    });

    it('单个 key 写失败不影响其余 key', () => {
        storage.failOn.add('i18nextLng');

        const written = applyDefaultSettings();

        expect(written).not.toContain('i18nextLng');
        expect(storage.getItem('i18nextLng')).toBeNull();
        expect(written.length).toBe(Object.keys(DEFAULT_SETTINGS).length - 1);
    });

    // 用户明确要求：网易云 Cookie 这类凭证不能进 APK。
    // 这条钉住生成器的剔除规则 —— 重新采集时若规则失效，CI 会先炸。
    it('默认设置里不含任何疑似凭证的 key', () => {
        const credentialPattern = /cookie|token|password|secret|credential|userid|dfid|session[_-]?id/i;

        const offenders = Object.keys(DEFAULT_SETTINGS).filter((k) => credentialPattern.test(k));

        expect(offenders).toEqual([]);
    });

    it('默认设置的值里不含网易云会话标识', () => {
        const offenders = Object.entries(DEFAULT_SETTINGS).filter(([, v]) => /MUSIC_[ARSU]/.test(v));

        expect(offenders).toEqual([]);
    });
});
