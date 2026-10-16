import { afterEach, describe, expect, it } from 'vitest';
import {
    NETEASE_CARD_ATTR,
    NETEASE_CARD_COVER_ATTR,
    NETEASE_HERO_ATTR,
    NETEASE_HERO_KEY_ATTR,
    consumeNeteaseMorphFresh,
    getNeteaseMorphSnapshot,
    resetNeteaseMorph,
    setNeteaseMorphFlying,
    subscribeNeteaseMorph,
} from '../../../src/library/suites/netease/neteaseMorph';

// 这份 store 是「封面飞出」跨三个组件的唯一通道，而它的失败方式是**静默**的：
// 少调一次 setNeteaseMorphFlying(null) 不会报错、不会红，只会让详情页的大图永远停在
// opacity:0 —— 症状是「打开歌单后顶部一片空白，封面不见了」。
// 所以这里把组件依赖的语义逐条钉死。
describe('neteaseMorph 的跨组件契约', () => {
    afterEach(() => {
        resetNeteaseMorph();
    });

    it('flyingKey 起飞置位、落位置回 null —— 大图就是靠它决定隐不隐藏的', () => {
        expect(getNeteaseMorphSnapshot().flyingKey).toBe(null);
        setNeteaseMorphFlying('3136952023');
        expect(getNeteaseMorphSnapshot().flyingKey).toBe('3136952023');
        setNeteaseMorphFlying(null);
        expect(getNeteaseMorphSnapshot().flyingKey).toBe(null);
    });

    it('重复设同一个 key 不会推进版本号（onAnimationComplete 与看门狗可能都来一次）', () => {
        setNeteaseMorphFlying('abc');
        const before = getNeteaseMorphSnapshot().revision;
        setNeteaseMorphFlying('abc');
        expect(getNeteaseMorphSnapshot().revision).toBe(before);
    });

    it('置回 null 会计推进版本号 —— 所以清之前必须先 consumeNeteaseMorphFresh', () => {
        setNeteaseMorphFlying('abc');
        const before = getNeteaseMorphSnapshot().revision;
        setNeteaseMorphFlying(null);
        expect(getNeteaseMorphSnapshot().revision).toBeGreaterThan(before);
    });

    // ⛔ 这是「落位时清 flyingKey」最危险的那一步：版本号一变，渲染期的起飞判定就会重跑。
    // fresh 若还是 true，它会看到「版本号变了 + 账还在 + fresh 为真」于是再飞一次，
    // 再落位、再推进、再起飞 —— 转场层把自己锁死在循环里。
    it('先 consume 再清 flyingKey，fresh 必须为 false（否则会无限重飞）', () => {
        const seen: boolean[] = [];
        const off = subscribeNeteaseMorph(() => {
            const s = getNeteaseMorphSnapshot();
            // 模拟渲染期的起飞判定条件：账还在 && fresh 为真 → 会再飞
            seen.push(s.hasBooking && s.fresh && !s.closing);
        });
        // 手工造一份「新鲜记账 + 飞行中」
        setNeteaseMorphFlying('abc');
        consumeNeteaseMorphFresh();
        const beforeClear = seen.filter(Boolean).length;
        setNeteaseMorphFlying(null);
        off();
        expect(beforeClear).toBe(0);
        expect(getNeteaseMorphSnapshot().fresh).toBe(false);
    });

    it('DOM 契约属性名固定 —— 改了就静默失效（不报错、不红、转场悄悄不发生）', () => {
        expect(NETEASE_CARD_ATTR).toBe('data-nt-card');
        expect(NETEASE_CARD_COVER_ATTR).toBe('data-nt-card-cover');
        expect(NETEASE_HERO_ATTR).toBe('data-nt-hero-cover');
        expect(NETEASE_HERO_KEY_ATTR).toBe('data-nt-hero-key');
    });
});
