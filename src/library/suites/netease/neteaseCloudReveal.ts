// src/library/suites/netease/neteaseCloudReveal.ts
// 「浮云」文字出现的**纯逻辑部分**：切词 + 每一档的浮现节奏。
//
// 抽出来单独放，是因为切词有一条必须守住的契约：**空格不能丢**。
// 逐词拆成元素之后，空格要是没跟着走，"Yofukashi Gaming" 会粘成 "YofukashiGaming"。
//
// 这套东西的来历：用户先要「把歌词界面的云阶文字效果铺开」，随后明确说
// 「每块独立缩放/微旋这些特性都不要，要不然影响可读性，我想要浮云的字出现的效果，而非它的排版」。
//
// ⛔ 第一版把「出现的效果」也一起砍了，只剩淡入 + 上浮，被用户一眼看穿少了三样：
// **模糊出场、弹性入场、颜色追踪**。这三样全都属于出场效果，不是排版，不该跟着排版一起删。
// 原版出处：glowWordVariants.ts:55（blur 10px）、:27（spring 200/20）、partitaLayout.ts:94（追色）。
//
// 砍掉的**只有**排版：不均匀切块、左右错位、逐块缩放方差、微旋、引导线。

/** 文字的视觉档位。大字浮得远、浮得久，小字只是轻轻一动。 */
export type NeteaseCloudTier = 'display' | 'title' | 'item' | 'meta';

export interface CloudRevealSpec {
    /** 浮起来的距离（px）。 */
    rise: number;
    /** 每个词之间的延迟（秒）。 */
    stagger: number;
    /** 单个词浮现的时长（秒）。弹簧的静息时间，不单独控制缓动。 */
    duration: number;
    /** 出场时的模糊半径（px）。按字号缩放 —— 原版是 10px，那是给 40~88px 大字用的。
     *  **0 表示这一档不做模糊**：见下面 meta 那行的理由。 */
    blur: number;
    /** 模糊消退的时长（秒）。 */
    blurDuration: number;
    /** 颜色从底色混出来的状态走到最终色所需的时长（秒）。比模糊长，追色才看得见。 */
    tintDuration: number;
}

export const NETEASE_CLOUD_TIERS: Record<NeteaseCloudTier, CloudRevealSpec> = {
    // 页面大标题（歌单详情名、板块标题）
    display: { rise: 9, stagger: 0.055, duration: 0.52, blur: 3.5, blurDuration: 0.34, tintDuration: 0.44 },
    // 次级标题（空状态说明、折叠区块标签）
    title: { rise: 6, stagger: 0.045, duration: 0.44, blur: 2.5, blurDuration: 0.30, tintDuration: 0.40 },
    // 列表主文本（歌单名、曲目名）
    item: { rise: 4, stagger: 0.030, duration: 0.36, blur: 2, blurDuration: 0.26, tintDuration: 0.36 },
    // 副文本（曲目数、艺人、标签栏）
    //
    // ⚠️ blur = 0：**这一档是全页最密的**（歌单详情页 145/223，首页约一半），
    // 而 13px 上的 1.6px 模糊恰恰是四档里最看不出来的。
    // 真机 A/B 过：给全部四档都加模糊，首页冷启入场的中位帧间隔从 12ms 涨到 18ms，
    // 代价几乎全在这最密、也最看不出的一档上。宁可少这一档，别的档位模糊照给。
    meta: { rise: 3, stagger: 0.022, duration: 0.30, blur: 0, blurDuration: 0.22, tintDuration: 0.32 },
};

const CJK = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/;
const TRAILING_PUNCT = /[，。、；：？！…—·）】》」』%'"”’,.:;!?)\]}>]/;

/**
 * 切成「显示词」，逐词依次浮现。
 *
 * 规则：
 * - CJK 逐字成词 —— 中文没有词间空格，逐字才是「一个字一个字浮出来」的意思。
 * - 拉丁按空格 / 连字符成词，**单词内部的空格必须跟着走**（见下面那条注释）。
 * - 标点粘到前一个词上：它属于前一个词的视觉结尾，单独飘一下会很怪。
 */
export const tokenizeCloudText = (text: string): string[] => {
    // 先把连续空白压成一个再去掉首尾，避免出现「只有一个空格」的尾部 token。
    const source = text.replace(/\s+/g, ' ').trim();
    if (!source) return [];

    const tokens: string[] = [];
    let latin = '';
    const flushLatin = () => {
        if (latin) { tokens.push(latin); latin = ''; }
    };
    for (const ch of Array.from(source)) {
        if (ch === ' ') {
            flushLatin();
            // ⚠️ 空格粘到前一个词的尾巴上。直接丢掉会把 "Yofukashi Gaming" 粘成
            // "YofukashiGaming" —— 逐词拆元素之后，空格是没有任何东西会自动补上的。
            const last = tokens[tokens.length - 1];
            if (last !== undefined && !last.endsWith(' ')) tokens[tokens.length - 1] = `${last} `;
            continue;
        }
        if (CJK.test(ch)) {
            flushLatin();
            tokens.push(ch);
            continue;
        }
        if (TRAILING_PUNCT.test(ch)) {
            // ⚠️ 必须先 flushLatin。缓冲区里还没落盘的词是这个标点真正的前驱：
            //   "Song (Remastered 2011)" 的 ')' 如果直接去拼数组最后一个元素，
            //   会粘到 "(Remastered " 尾巴上，拼出 "Song (Remastered )2011"。
            flushLatin();
            const last = tokens[tokens.length - 1];
            if (last !== undefined && !last.endsWith(ch)) {
                tokens[tokens.length - 1] = last + ch;
            } else {
                // 前面什么都没有就自己成块 —— 绝不吞字符。
                tokens.push(ch);
            }
            continue;
        }
        latin += ch;
    }
    flushLatin();

    // 收尾：去掉最后一个词尾巴上的空格（整串首尾空白已经在 source 那步处理过了）。
    const lastIndex = tokens.length - 1;
    if (lastIndex >= 0) {
        tokens[lastIndex] = tokens[lastIndex].replace(/\s+$/, '');
    }
    return tokens.filter(token => token.trim().length > 0);
};
