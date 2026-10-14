// src/navigation/back/backCoordinator.ts
// 返回键仲裁器（纯逻辑，不碰 DOM / window / Capacitor，便于单测）。
//
// 为什么需要它：Android 的系统返回键只有一个入口，Folia 却有多层「退一级」的语义
// （浮层 → suite 面板 → 集合栈 → 视图 → 退出 App）。谁都不接这个键，Capacitor 就会
// 走 Activity 默认行为直接 finish；随便挑一层来接，又会在浮层盖着集合层时穿透。
// 所以这里用一个有序注册表决定「这一次退哪一层」，各层只负责回答两件事：
// 此刻我能不能退（canHandle）、我退掉之后是什么样（handle）。
//
// 为什么不直接 window.history.back()：Folia 的 history 记录与 UI 层级并不一一对应。
// 命令面板 / 设置 / 搜索浮层根本不压 history 记录（直接 back 会穿透到下层界面），
// 而 suite 自己的面板记录又被 findLayerBaseIndex 归为「同一层」。
//
// 同优先级按「后注册者优先」消费（LIFO）：后注册的那层在视觉上更靠上，
// 与浮层的栈语义一致 —— 例如设置里再开一层子视图，只有子视图该先关。

/** 优先级由高到低；数组下标即权重，不要随意重排。 */
export const BACK_PRIORITIES = ['overlay', 'suite', 'collection', 'view', 'app'] as const;

export type BackPriority = (typeof BACK_PRIORITIES)[number];

export type BackHandler = {
    /** 稳定标识，仅用于调试与测试断言。 */
    id: string;
    priority: BackPriority;
    /** 此刻这一层能不能消费返回键。要便宜、要幂等，不做副作用。 */
    canHandle: () => boolean;
    /** 消费返回键。抛异常不会中断仲裁。 */
    handle: () => void;
};

export type BackDispatchResult =
    | { type: 'handled'; id: string; priority: BackPriority }
    | { type: 'unhandled' };

export type BackCoordinator = {
    /** 注册一层，返回注销函数（组件卸载时调用）。 */
    register: (handler: BackHandler) => () => void;
    /** 消费一次返回键：按优先级找到最靠上的那一层并调用它。 */
    dispatch: () => BackDispatchResult;
    /** 清空注册表。 */
    reset: () => void;
    /** 当前注册的层数（测试与调试用）。 */
    size: () => number;
};

const priorityWeight = (priority: BackPriority): number => BACK_PRIORITIES.indexOf(priority);

export const createBackCoordinator = (): BackCoordinator => {
    // 注册顺序即压栈顺序，注销按对象身份移除，不受索引漂移影响。
    let handlers: BackHandler[] = [];

    const register = (handler: BackHandler): (() => void) => {
        handlers.push(handler);
        return () => {
            const index = handlers.indexOf(handler);
            if (index !== -1) handlers.splice(index, 1);
        };
    };

    const dispatch = (): BackDispatchResult => {
        // 优先级高的先试；同级里后注册的先试（更靠上层）。
        const ordered = handlers
            .map((handler, index) => ({ handler, index }))
            .sort((a, b) => {
                const byPriority = priorityWeight(a.handler.priority) - priorityWeight(b.handler.priority);
                return byPriority !== 0 ? byPriority : b.index - a.index;
            });

        for (const { handler } of ordered) {
            let canHandle = false;
            try {
                canHandle = handler.canHandle();
            } catch (error) {
                // 一层判断失败不该让整条返回链失灵（那等于返回键彻底没反应）。
                console.warn('[backCoordinator] canHandle threw, skipping layer:', handler.id, error);
                continue;
            }
            if (!canHandle) continue;
            try {
                handler.handle();
            } catch (error) {
                // 同理：消费失败也不能冒泡，否则原生回调里抛异常可能拖垮 WebView。
                console.error('[backCoordinator] handle threw:', handler.id, error);
            }
            return { type: 'handled', id: handler.id, priority: handler.priority };
        }
        return { type: 'unhandled' };
    };

    return {
        register,
        dispatch,
        reset: () => { handlers = []; },
        size: () => handlers.length,
    };
};
