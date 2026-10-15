// src/library/suites/netease/neteaseMorph.ts
// 「封面飞出」的 DOM 契约 + 跨组件的那一小份状态。
//
// 为什么单独一份：这套转场要跨三个组件传同一件事，而它们不在同一棵 React 树里 ——
//   ① NeteaseHome 的歌单卡片（起飞框在这里，被点的那一刻量）
//   ② NeteaseCollection 的大图封面（落点框在这里，挂载后才有）
//   ③ 常驻的转场层 NeteaseCollectionMorph（真正画飞行的那个）
// 走 React 传是传不通的（点击发生时详情页还不存在），所以约定：两边各自把属性写在自己身上，
// 中间这一份模块级 store 只传「量好的矩形」。
//
// ⚠️ 属性名是**静默失效**的：任何一边单独改名都不会报错、不会红、测试也照过，
// 只是转场悄悄不发生了（和 grid/transitions/gridMorphContract.ts 同一个坑）。
// 所以生产方（NeteaseHome / NeteaseCollection）和消费方（NeteaseCollectionMorph）都从这一份取名字。

/** 首页歌单卡片的整张卡（那个 button）。**点击判定认它**，不是认封面。 */
export const NETEASE_CARD_ATTR = 'data-nt-card';
/** 卡片里那张封面图 —— 起飞框量的是它，不是卡片外框。 */
export const NETEASE_CARD_COVER_ATTR = 'data-nt-card-cover';
/** 详情页顶部那张满屏宽大图 —— **落点框量的是它**。 */
export const NETEASE_HERO_ATTR = 'data-nt-hero-cover';
/** 大图属于哪一层（集合 id）：详情页可能先后渲染多层，查询时必须认它。 */
export const NETEASE_HERO_KEY_ATTR = 'data-nt-hero-key';
/** 飞行中那张封面自己。它挂在 document.body 上（portal），没有宿主特征属性，只能这样认。 */
export const NETEASE_FLYER_ATTR = 'data-nt-morph-flyer';

export type NeteaseMorphRect = { left: number; top: number; width: number; height: number };

/**
 * 飞行时长与曲线。**转场层与层间淡入必须共用这两个值**（分别在 NeteaseCollectionMorph 与
 * neteaseLayerTransition 里用），差一点点就会出现「封面还在飞、底下的两层已经换完了」。
 *
 * 曲线 [0.25, 0.46, 0.45, 0.94]（easeOutQuad）是**照参考视频逐帧量出来的**，不是随手挑的：
 * 那一段里封面占屏宽 29% → 67% → 91% → 100%，换算成归一化进度是
 * 时刻 0.273 / 0.545 / 1.000 对应进度 0.535 / 0.879 / 1.000 —— 前半段冲得快、后半段明显收住。
 * 匀速会让整张封面像被匀速抽走，读起来很机械。
 */
export const NETEASE_MORPH_DURATION = 0.55;
export const NETEASE_MORPH_EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

/** 圆角与卡片封面、大图完全一致 —— 落位那一刻两者像素级重合，交换才看不出来。 */
export const NETEASE_MORPH_RADIUS = 12;

/** 一次飞行的两端。coverUrl 两端用的是同一张图（同一个 URL、同一份解码结果），落位时交换看不出来。 */
export type NeteaseMorphLeg = { from: NeteaseMorphRect; to: NeteaseMorphRect; coverUrl: string };

const readRect = (el: Element | null): NeteaseMorphRect | null => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    // 宽或高为 0 说明这会儿它没被布局（display:none / 还没挂上），当没量到。
    if (r.width <= 0 || r.height <= 0) return null;
    return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/** 起飞框：被点的那张卡片封面。 */
export const readNeteaseCardRect = (key: string): NeteaseMorphRect | null => readRect(
    document.querySelector(`[${NETEASE_CARD_ATTR}="${cssEscape(key)}"] [${NETEASE_CARD_COVER_ATTR}]`),
);

/** 落点框：详情页的大图。key 是集合 id，避免拿到上一层残留的那张。 */
export const readNeteaseHeroRect = (key: string): NeteaseMorphRect | null => readRect(
    document.querySelector(`[${NETEASE_HERO_ATTR}][${NETEASE_HERO_KEY_ATTR}="${cssEscape(key)}"]`),
);

/** 详情页大图上那张 img 的 src；拿不到就退回卡片上那张。 */
export const readNeteaseHeroSrc = (key: string): string | null => {
    const holder = document.querySelector(`[${NETEASE_HERO_ATTR}][${NETEASE_HERO_KEY_ATTR}="${cssEscape(key)}"]`);
    const img = holder?.querySelector('img');
    return img?.getAttribute('src') || null;
};

/** 集合 id 里可能有引号 / 空格之类，选择器里必须转义。 */
const cssEscape = (value: string): string => (
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(value)
        : value.replace(/["\\]/g, '\\$&')
);

// ── 跨组件的那份状态 ───────────────────────────────────────────────────────
// 模块级可变对象 + 一个订阅集合就够：只有转场层一个消费者，surface 只写不读。

type MorphState = {
    /** 点开的这张卡片的集合 id；返回时用它找回同一张卡。 */
    key: string | null;
    /** 起飞框，在点击那一刻量的（那时它还好好地待在首页上）。 */
    cardRect: NeteaseMorphRect | null;
    coverUrl: string | null;
    /** 「有这份记账」—— 返回那一腿的起点，不管过没过期都在。 */
    hasBooking: boolean;
    /** 这一份记账是不是**这一次点击**刚写下的。转场层只认新鲜的记账才会起飞。 */
    fresh: boolean;
    /** 这一轮是「回去」而不是「进去」。beforeBack 一律置位，量不到大图也置位。 */
    closing: boolean;
    /** beforeBack 量好的返回腿（hero → card）。有值就说明该飞回去了。 */
    back: NeteaseMorphLeg | null;
    /** 记账版本号：转场层靠它决定「要不要为这一次变化起飞」。 */
    revision: number;
};

const EMPTY: MorphState = {
    key: null, cardRect: null, coverUrl: null, hasBooking: false, fresh: false, closing: false, back: null, revision: 0,
};

let state: MorphState = EMPTY;
const listeners = new Set<() => void>();

/** 写完再通知。顺序反了订阅方读到的是旧状态 —— 返回就会退化成一次普通淡出（真机踩过）。 */
const commit = (next: Omit<MorphState, 'revision'>): void => {
    state = { ...next, revision: state.revision + 1 };
    listeners.forEach(fn => fn());
};

export const subscribeNeteaseMorph = (fn: () => void): (() => void) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
};

export const getNeteaseMorphSnapshot = (): MorphState => state;

/**
 * 点击落在歌单卡片上时记一笔。
 *
 * ⛔ 判定要从**整张卡片**（`data-nt-card`，那个 button）往上找，不能只认封面那个 div ——
 * 封面是 button 的**子**元素，用户点卡片下半部分的歌名时 `event.target` 是 button 自己，
 * `closest('[data-nt-card-cover]')` 一路往上永远走不到那个子节点，于是「点封面能起飞、点歌名不能」。
 * 真机上第一版就是这么半好半坏的。量起飞框仍然量封面（`[data-nt-card] [data-nt-card-cover]`）。
 *
 * 只认首页卡片：从歌单里点专辑、从搜索结果点歌单都**不**起飞 —— 那些页面没有对应的卡片框，
 * 硬凑一个起点只会让飞行从屏幕中间凭空长出来。那几种入口走层间淡入。
 */
export const armNeteaseMorphOpen = (target: EventTarget | null): boolean => {
    const node = target instanceof Element ? target : null;
    const card = node?.closest?.(`[${NETEASE_CARD_ATTR}]`) ?? null;
    if (!card) return false;
    const key = card.getAttribute(NETEASE_CARD_ATTR);
    const cover = card.querySelector(`[${NETEASE_CARD_COVER_ATTR}]`);
    const rect = readRect(cover);
    const coverUrl = cover?.querySelector('img')?.getAttribute('src') ?? null;
    if (!key || !rect || !coverUrl) return false;
    commit({ key, cardRect: rect, coverUrl, hasBooking: true, fresh: true, closing: false, back: null });
    return true;
};

/**
 * 点击**没有**落在卡片上：把这次点击标成「不是开场」，但**不要清掉已有记账**。
 *
 * ⛔ 不能在这里清空，真机上点「返回」时记账先被清掉、紧接着 `beforeBack` 就量不到任何东西 ——
 * 返回永远退化成普通淡入。清空改由 `discardNeteaseMorphIfStale` 在 beforePush 里按新鲜度做。
 *
 * ⛔ 也不能只清新鲜度、不管记账还在不在：歌单详情页里点一首歌也会走到这里，
 * 而上一页留下的记账仍然完好，转场层若只看「有没有记账」就会在点歌时也起飞一次封面。
 * 所以新鲜度和记账是**两个**判据：新鲜的才能起飞，但记账要留到返回时用。
 */
export const markNeteaseMorphNotOpen = (): void => {
    if (!state.fresh) return;
    commit({ ...state, fresh: false });
};

/**
 * 压栈前调用：这次压栈不是「从首页卡片点开」的话（上一次点歌单留下的记账），
 * 把它丢掉，免得隔了很久返回时飞回一张早就不相干的卡。
 *
 * `fresh` 由捕获阶段的点击监听写：卡片点击与 beforePush 在**同一次事件派发**里先后发生，
 * 所以「卡片点开的压栈」到这里一定是新鲜的；其它入口（搜索结果、歌手页里的专辑）不是。
 */
export const discardNeteaseMorphIfStale = (): void => {
    if (state.fresh) return;
    resetNeteaseMorph();
};

/**
 * 起飞前读一次记账。**读完不消费** —— 返回时 `armNeteaseMorphBack` 还要用同一份 cardRect，
 * 所以这份记账一直留到本轮 `resetNeteaseMorph` 为止。
 */
export const getNeteaseMorphOpen = (): { key: string; rect: NeteaseMorphRect; coverUrl: string } | null => (
    state.key && state.cardRect && state.coverUrl
        ? { key: state.key, rect: state.cardRect, coverUrl: state.coverUrl }
        : null
);

/**
 * 返回前的准备：在**弹栈之前**量好返回腿。
 *
 * 为什么必须现在量：宿主是先清空导航 store 再让集合层退场，而大图就在集合层里 ——
 * 等到退场动画开始再量就晚了。卡片那端此时是 `visibility: hidden`（层没卸载、布局还在），
 * `getBoundingClientRect()` 照样给真实几何，不用等首页重新可见。
 *
 * ⛔ `closing` 是**无条件**置位的，量不到大图也置。
 * 这一条拦的是硬件返回键那条路：它不产生点击事件，`markNeteaseMorphNotOpen` 不会被调到，
 * 新鲜度还停在 true —— 若这时量不到大图、账又还在，转场层就会在弹栈的同时**朝前**再飞一次。
 */
export const armNeteaseMorphBack = (): boolean => {
    const { key, cardRect } = state;
    const hero = key ? readNeteaseHeroRect(key) : null;
    const coverUrl = hero && key ? readNeteaseHeroSrc(key) ?? state.coverUrl : null;
    const leg = hero && cardRect && coverUrl
        ? { from: hero, to: cardRect, coverUrl }
        : null;
    commit({ ...state, closing: true, back: leg });
    return leg !== null;
};

/** 转场层取走返回腿（取走即作废，重复触发不会飞两次）。 */
export const takeNeteaseMorphBack = (): NeteaseMorphLeg | null => {
    const back = state.back;
    if (!back) return null;
    commit({ ...state, back: null });
    return back;
};

/** 一次转场彻底结束（落位或放弃）后复位，让下一轮从干净状态开始。 */
export const resetNeteaseMorph = (): void => {
    if (!state.hasBooking && !state.back && !state.fresh && !state.closing) return;
    commit(EMPTY);
};
