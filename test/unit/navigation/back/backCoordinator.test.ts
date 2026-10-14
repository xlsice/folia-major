import { describe, expect, it, vi } from 'vitest';
import {
    BACK_PRIORITIES,
    createBackCoordinator,
    type BackDispatchResult,
    type BackHandler,
    type BackPriority,
} from '@/navigation/back/backCoordinator';

// test/unit/navigation/back/backCoordinator.test.ts
// 返回键仲裁器的契约（2026-10-14 Android 返回键修复）。
//
// 这一层是纯逻辑，不碰 DOM / window / Capacitor，所以仲裁顺序可以脱离真机断言。
// 它要保证的三件事：
//   1. 一次返回只被「最靠上」的一层消费，且严格按 overlay → suite → collection → view → app；
//   2. 同优先级按 LIFO（后注册者优先），因为二级浮层总是后开的；
//   3. 任何一层自己坏掉（判断或消费抛异常）都不能让整条返回链失灵 —— 那等于返回键彻底没反应。

/** 造一层：can 由闭包控制，handle 是 spy。 */
const layer = (id: string, priority: BackPriority, can: () => boolean = () => true) => {
    const handle = vi.fn();
    const handler: BackHandler = { id, priority, canHandle: can, handle };
    return { handle, handler };
};

/** 断言这一次被消费了，并返回被消费层的 id（顺带做类型收窄）。 */
const handledId = (result: BackDispatchResult): string => {
    expect(result.type).toBe('handled');
    if (result.type !== 'handled') throw new Error('unreachable');
    return result.id;
};

describe('backCoordinator', () => {
    it('没有任何层可消费时报告 unhandled（调用方据此交回系统）', () => {
        const coordinator = createBackCoordinator();
        expect(coordinator.dispatch()).toEqual({ type: 'unhandled' });
    });

    it('只有一层可消费时就消费那一层', () => {
        const coordinator = createBackCoordinator();
        const view = layer('player', 'view');
        coordinator.register(view.handler);

        expect(coordinator.dispatch()).toEqual({ type: 'handled', id: 'player', priority: 'view' });
        expect(view.handle).toHaveBeenCalledTimes(1);
    });

    it('严格按优先级消费：overlay 压过 collection / view', () => {
        const coordinator = createBackCoordinator();
        // 故意从低到高注册，确认排序不看注册顺序。
        const view = layer('player', 'view');
        const collection = layer('collection', 'collection');
        const overlay = layer('settings', 'overlay');
        coordinator.register(view.handler);
        coordinator.register(collection.handler);
        coordinator.register(overlay.handler);

        expect(coordinator.dispatch()).toEqual({ type: 'handled', id: 'settings', priority: 'overlay' });
        expect(overlay.handle).toHaveBeenCalledTimes(1);
        expect(collection.handle).not.toHaveBeenCalled();
        expect(view.handle).not.toHaveBeenCalled();
    });

    it('同优先级按 LIFO：后注册的二级浮层先被消费', () => {
        const coordinator = createBackCoordinator();
        const base = layer('settings-modal', 'overlay');
        const sub = layer('settings-subview', 'overlay');
        coordinator.register(base.handler);
        coordinator.register(sub.handler);

        expect(handledId(coordinator.dispatch())).toBe('settings-subview');
        expect(sub.handle).toHaveBeenCalledTimes(1);
        expect(base.handle).not.toHaveBeenCalled();
    });

    it('上层说「不是我」时穿透到下层，而不是整条链失灵', () => {
        const coordinator = createBackCoordinator();
        const palette = layer('command-palette', 'overlay', () => false);
        const collection = layer('collection', 'collection');
        coordinator.register(palette.handler);
        coordinator.register(collection.handler);

        expect(handledId(coordinator.dispatch())).toBe('collection');
        expect(collection.handle).toHaveBeenCalledTimes(1);
    });

    it('全部层都说「不是我」才落到兜底层', () => {
        const coordinator = createBackCoordinator();
        const settings = layer('settings', 'overlay', () => false);
        const collection = layer('collection', 'collection', () => false);
        const exit = layer('app-exit', 'app');
        coordinator.register(settings.handler);
        coordinator.register(collection.handler);
        coordinator.register(exit.handler);

        expect(coordinator.dispatch()).toEqual({ type: 'handled', id: 'app-exit', priority: 'app' });
        expect(exit.handle).toHaveBeenCalledTimes(1);
    });

    it('注销后该层不再参与仲裁', () => {
        const coordinator = createBackCoordinator();
        const view = layer('player', 'view');
        const exit = layer('app-exit', 'app');
        const unregisterView = coordinator.register(view.handler);
        coordinator.register(exit.handler);
        expect(coordinator.size()).toBe(2);

        unregisterView();
        expect(coordinator.size()).toBe(1);
        expect(handledId(coordinator.dispatch())).toBe('app-exit');
        expect(view.handle).not.toHaveBeenCalled();
    });

    it('重复注销同一层是安全的（注册表不会被改坏）', () => {
        const coordinator = createBackCoordinator();
        const unregister = coordinator.register(layer('player', 'view').handler);
        unregister();
        expect(() => unregister()).not.toThrow();
        expect(coordinator.size()).toBe(0);
    });

    it('某层 canHandle 抛异常时跳过它，继续问下一层', () => {
        const coordinator = createBackCoordinator();
        const broken = layer('broken', 'overlay', () => {
            throw new Error('boom');
        });
        const exit = layer('app-exit', 'app');
        coordinator.register(broken.handler);
        coordinator.register(exit.handler);

        expect(handledId(coordinator.dispatch())).toBe('app-exit');
        expect(broken.handle).not.toHaveBeenCalled();
    });

    it('某层 handle 抛异常也不冒泡，仍视为已消费（避免原生回调里崩掉 WebView）', () => {
        const coordinator = createBackCoordinator();
        const broken: BackHandler = {
            id: 'broken',
            priority: 'view',
            canHandle: () => true,
            handle: () => {
                throw new Error('boom');
            },
        };
        coordinator.register(broken);

        expect(() => coordinator.dispatch()).not.toThrow();
        expect(coordinator.dispatch()).toEqual({ type: 'handled', id: 'broken', priority: 'view' });
    });

    it('reset 清空注册表', () => {
        const coordinator = createBackCoordinator();
        coordinator.register(layer('player', 'view').handler);
        coordinator.reset();
        expect(coordinator.size()).toBe(0);
        expect(coordinator.dispatch()).toEqual({ type: 'unhandled' });
    });

    it('优先级表本身按 overlay → suite → collection → view → app 排列（别重排）', () => {
        expect([...BACK_PRIORITIES]).toEqual(['overlay', 'suite', 'collection', 'view', 'app']);
    });
});
