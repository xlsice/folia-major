import React from 'react';
import type { LibraryAccountActionId } from '../../core/contracts/account';
import type { LibraryArtistActionId } from '../../core/contracts/suite';
import type { LibraryHomeActionId } from '../../core/contracts/suite';
import type { LibraryActionId, LibrarySuiteManifest, LibrarySuiteTransitions } from '../../core/contracts/suite';

// src/library/suites/netease/entry.ts
// netease suite：手机版网易云音乐的信息架构与交互模型，套在 Folia 的资料库上。
//
// 为什么它存在：bravais 那套「一整面墙 + 缝」的浏览方式很美，但它是桌面空间的思路——
// 悬停显形、键盘翻牌、鼠标横扫。在手机竖屏上这套隐喻不成立（缝、书脊、透视窗都无处施力）。
// 网易云手机版反过来：一切都摊平成一列可纵向滚动的列表，靠底部标签栏切换、
// 靠常驻的「⋯」拿操作。这是被几亿人验证过的触屏范式，本 suite 照它重建。
//
// 换的是**画法**，不是数据：契约（core/contracts）里的资源、播放端口、变更控制器、
// 订阅快照全都是宿主原样递给来的，本 suite 只读不建。切换 suite 不重新请求、不丢登录态。
//
// 本文件只能静态 import react（test/unit/library/suiteEntries.test.ts 有静态约束）：
// 四个 surface 组件一律 React.lazy，没选 netease 的人不加载它的任何 chunk。

/**
 * 本套的转场声明（Win8 式整层推移）。
 *
 * 它也是空壳：推移参数和读「降低动态效果」的闸门都在 ./neteaseLayerTransition 里，
 * 那是懒加载模块，本文件不能静态 import 它 —— registry 是 eager glob 扫所有 entry 的，
 * 静态 import 会把整块推移（含 framer-motion 与动效 store）拉进**每个**用户的首屏，
 * 哪怕他这辈子没选过 netease。test/unit/library/suiteEntries.test.ts 就是守这条的。
 *
 * 灌入时机是确定的：下面四个 lazy loader 里的任何一个 resolve 时就 Object.assign，
 * 而宿主只在某套 suite 的 surface 真正要渲染时才去读 `transitions.layer`。
 * 也就是说 —— 读到它时它必然已经就位，不存在「第一次打开没动画、第二次才有」。
 * 没选 netease 的人连这个 chunk 都不会下载。
 */
const transitions: LibrarySuiteTransitions = {};

const attachTransitions = (module: { neteaseTransitions?: LibrarySuiteTransitions }): void => {
    if (module.neteaseTransitions) Object.assign(transitions, module.neteaseTransitions);
};

const NeteaseHome = React.lazy(() => import('./NeteaseHome').then(module => {
    attachTransitions(module);
    return { default: module.default };
}));
const NeteaseCollection = React.lazy(() => import('./NeteaseCollection').then(module => {
    attachTransitions(module);
    return { default: module.default };
}));
const NeteaseArtist = React.lazy(() => import('./NeteaseArtist').then(module => {
    attachTransitions(module);
    return { default: module.default };
}));
const NeteaseAccount = React.lazy(() => import('./NeteaseAccount').then(module => {
    attachTransitions(module);
    return { default: module.default };
}));

// 集合动作（NeteaseCollection）：行内「⋯」菜单里的那几项 + 头部操作条。
// - play / enqueue / play-scope / enqueue-scope：头部播放键与入队键
// - rename / export-playlist / delete-collection / reload：右上「⋯」
// - remove-entry / add-to-playlist / subscribe：行内与操作条
// - open-artist：歌曲行的「查看歌手」；open-album 由 collection 头部之外不重复提供
// - filter / sort / resume-sync：过滤走宿主的浏览会话，续传有专门按钮，故不声明 sort
const COLLECTION_ACTIONS: readonly LibraryActionId[] = [
    'play',
    'enqueue',
    'play-scope',
    'enqueue-scope',
    'filter',
    'reload',
    'resume-sync',
    'remove-entry',
    'subscribe',
    'rename',
    'delete-collection',
    'export-playlist',
    'add-to-playlist',
    'open-artist',
];

// 首页动作（NeteaseHome）：底部四个标签页。
// 本地页的导入 / 刷新走按钮；在线页签只读歌单，账户动作声明在 account surface 里。
const HOME_ACTIONS: readonly LibraryHomeActionId[] = [
    'directory-filter',
    'home-import-folder',
    'home-refresh-folders',
];

// 歌手动作（NeteaseArtist）：热门歌曲播放 / 收藏、专辑网格、重新加载、专辑续页。
const ARTIST_ACTIONS: readonly LibraryArtistActionId[] = [
    'play',
    'enqueue',
    'play-scope',
    'enqueue-scope',
    'filter',
    'reload',
    'resume-sync',
    'open-album',
];

// 账户动作（NeteaseAccount）：扫码登录、登录方式选择、切换确认、诊断、重启后端。
// account-select / account-logout 由首页的账户入口驱动（与 grid 同规则）。
const ACCOUNT_ACTIONS: readonly LibraryAccountActionId[] = [
    'account-login',
    'account-login-method',
    'account-switch-confirm',
    'account-select',
    'account-logout',
    'account-login-diagnostics',
    'account-backend-restart',
];

const netease: LibrarySuiteManifest = {
    id: 'netease',
    labelKey: 'libraryNetease.suiteName',
    surfaces: {
        home: { component: NeteaseHome, actions: HOME_ACTIONS },
        collection: { component: NeteaseCollection, actions: COLLECTION_ACTIONS },
        artist: { component: NeteaseArtist, actions: ARTIST_ACTIONS },
        account: { component: NeteaseAccount, actions: ACCOUNT_ACTIONS },
    },
    // 整层推移（Win8 式平行推移）+ 它自己的降级闸门，都由懒加载模块在解析时灌进上面的空壳。
    // 这里**不声明** Overlay 与 beforePush / beforeBack：那两套是 grid 的移形换影要的，
    // 本套的推移由宿主直接搬动真实容器，不需要一层合成画面，也不需要提前量落点。
    transitions,
};

export default netease;