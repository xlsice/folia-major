import { describe, expect, it } from 'vitest';
import {
    NETEASE_CLOUD_TIERS,
    tokenizeCloudText,
} from '../../../src/library/suites/netease/neteaseCloudReveal';

describe('浮云文字（neteaseCloudReveal）', () => {
    describe('切词', () => {
        it('CJK 逐字成词 —— 中文没有词间空格，逐字才是「一个字一个字浮出来」', () => {
            expect(tokenizeCloudText('音乐库')).toEqual(['音', '乐', '库']);
        });

        it('拉丁按空格成词', () => {
            expect(tokenizeCloudText('Yofukashi Gaming')).toEqual(['Yofukashi ', 'Gaming']);
        });

        // ⛔ 这条是本模块存在的第一理由：逐词拆成元素之后，空格没有任何东西会自动补上。
        // 直接丢掉的话 "Yofukashi Gaming" 会粘成 "YofukashiGaming"。
        it('拼回去之后空格还在', () => {
            expect(tokenizeCloudText('Yofukashi Gaming').join('')).toBe('Yofukashi Gaming');
            expect(tokenizeCloudText('Hello  beautiful   world').join('')).toBe('Hello beautiful world');
        });

        it('标点粘到前一个词上', () => {
            expect(tokenizeCloudText('世界。')).toEqual(['世', '界。']);
        });

        // 与 partita 的差别：云阶要把 It + ’ + s 合成**一个 timing 单元**，
        // 这里不需要 —— 每个 token 只负责「独立浮一下」这一个瞬间。
        // 真正的契约是下面 describe 里那条 round-trip：拼回去必须一字不差。
        it('英文缩写不会吞字符（切点可以与云阶不同）', () => {
            expect(tokenizeCloudText("It's unbelievable").join('')).toBe("It's unbelievable");
        });

        it('行首标点自己成块，不丢', () => {
            expect(tokenizeCloudText("'90s R&B").join('')).toBe("'90s R&B");
        });

        it('开引号独立、闭引号粘住', () => {
            expect(tokenizeCloudText('「你好」')).toEqual(['「', '你', '好」']);
        });

        it('中英混排', () => {
            expect(tokenizeCloudText('异环10AM').join('')).toBe('异环10AM');
            expect(tokenizeCloudText('飞行雪绒（爱尔斯）').join('')).toBe('飞行雪绒（爱尔斯）');
        });

        it('不会吐出空 token', () => {
            for (const s of ['', '   ', 'a  b', '。。。', '  你好  ']) {
                expect(tokenizeCloudText(s).every(token => token.trim().length > 0)).toBe(true);
            }
        });

        it('空串切出空数组', () => {
            expect(tokenizeCloudText('')).toEqual([]);
        });
    });

    describe('任意输入都能原样拼回去', () => {
        // 这是这套东西最硬的约束：它要挂在 35 张卡片、几十行曲目名上，
        // 任何一处字符丢失或重复都是肉眼可见的文字 bug。
        it('join 之后与压平空白的原文一致', () => {
            const samples = [
                '音乐库',
                'Yofukashi Gaming',
                '今天从《だって女の子だ》',
                '飞行雪绒（爱丽丝）歌曲',
                '35 首',
                "It's unbelievable",
                '老城区，新样貌',
                '异环10AM',
                'Intro / Interlude',
                'Song (Remastered 2011) - 2009',
            ];
            for (const sample of samples) {
                const flat = sample.replace(/\s+/g, ' ').trim();
                expect(tokenizeCloudText(sample).join('')).toBe(flat);
            }
        });
    });

    describe('节奏分档', () => {
        it('大字浮得更高更久，小字只是轻轻一动', () => {
            expect(NETEASE_CLOUD_TIERS.meta.rise).toBeLessThan(NETEASE_CLOUD_TIERS.item.rise);
            expect(NETEASE_CLOUD_TIERS.item.rise).toBeLessThan(NETEASE_CLOUD_TIERS.display.rise);
            expect(NETEASE_CLOUD_TIERS.meta.duration).toBeLessThan(NETEASE_CLOUD_TIERS.display.duration);
        });

        it('档位越小错峰越密', () => {
            expect(NETEASE_CLOUD_TIERS.meta.stagger).toBeLessThan(NETEASE_CLOUD_TIERS.display.stagger);
        });

        it('每一档的数值都是正的有限数', () => {
            for (const spec of Object.values(NETEASE_CLOUD_TIERS)) {
                expect(Number.isFinite(spec.rise)).toBe(true);
                expect(spec.rise).toBeGreaterThan(0);
                expect(spec.stagger).toBeGreaterThanOrEqual(0);
                expect(spec.duration).toBeGreaterThan(0);
            }
        });
    });
});
