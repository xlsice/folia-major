// src/navigation/back/useBackCoordinator.ts
// 把各层「退一级」的能力接到系统返回键上。
//
// 为什么挂在 App 这一层：App.tsx 是全项目唯一同时持有三样东西的地方 ——
// 视图/集合的导航能力（useAppNavigation）、命令面板的开关（React state）、
// 以及各 store。所以仲裁器在这里注册一次就能覆盖全部层，不必把注册散进各个浮层组件。
//
// 层级从低到高注册：同优先级下仲裁器是「后注册者优先」（LIFO），
// 因此设置里的二级浮层（子视图 / 用户指南）会先于设置主面板被消费。

import { useEffect, useRef, useState } from 'react';
import type { AppView } from '../../stores/useAppViewStore';
import { useSearchNavigationStore } from '../../stores/useSearchNavigationStore';
import { useSettingsModalStore } from '../../stores/useSettingsModalStore';
import { useCollectionNavigationStore } from '../../stores/useCollectionNavigationStore';
import { setStatusMessage } from '../../stores/useStatusMessageStore';
import i18n from '../../i18n/config';
import { createBackCoordinator } from './backCoordinator';
import { exitNativeApp, subscribeNativeBackButton } from './nativeBackBridge';

// src/hooks/useBackCoordinator.ts

/** 退出兜底层的 id：dispatch 到它就意味着「下面没有可退的了」。 */
export const EXIT_BACK_HANDLER_ID = 'app-exit';

/** 「再按一次退出」的有效窗口。 */
export const EXIT_CONFIRM_WINDOW_MS = 2000;

/** App.tsx 注入的部分：只有 React state 才拿得到，store 类的层由本文件直接读。 */
export type BackCoordinatorSource = {
    isCommandPaletteOpen: boolean;
    closeCommandPalette: () => void;
    view: AppView;
    /** useAppNavigation().backCollection：集合栈退一层（栈底会整个关掉集合）。 */
    backCollection: () => void;
    backFromPlayer: () => void;
    backFromLattice: () => void;
};

export const useBackCoordinator = (source: BackCoordinatorSource): void => {
    // handler 只注册一次，所有判断都读这个 ref，保证拿到的是当次渲染的最新状态。
    const sourceRef = useRef(source);
    sourceRef.current = source;

    const [coordinator] = useState(createBackCoordinator);
    /** 上一次提示「再按一次退出」的时刻；0 = 未待命。 */
    const armedAtRef = useRef(0);

    useEffect(() => {
        const unregisterHandlers = [
            // 搜索浮层（不压 history，必须显式关掉，否则会穿透到下层界面）。
            coordinator.register({
                id: 'search-overlay',
                priority: 'overlay',
                canHandle: () => useSearchNavigationStore.getState().isSearchOpen,
                handle: () => useSearchNavigationStore.getState().hideSearchOverlay(),
            }),
            coordinator.register({
                id: 'command-palette',
                priority: 'overlay',
                canHandle: () => sourceRef.current.isCommandPaletteOpen,
                handle: () => sourceRef.current.closeCommandPalette(),
            }),
            coordinator.register({
                id: 'settings-modal',
                priority: 'overlay',
                canHandle: () => useSettingsModalStore.getState().settingsModalState.isOpen,
                handle: () => useSettingsModalStore.getState().closeSettings(),
            }),
            // 设置里的二级浮层：比设置主面板更靠上，靠 LIFO 保证它们先被消费。
            coordinator.register({
                id: 'settings-subview',
                priority: 'overlay',
                canHandle: () => useSettingsModalStore.getState().isSubSettingsViewOpen,
                handle: () => useSettingsModalStore.getState().setIsSubSettingsViewOpen(false),
            }),
            coordinator.register({
                id: 'user-guide',
                priority: 'overlay',
                canHandle: () => useSettingsModalStore.getState().isUserGuideModalOpen,
                handle: () => useSettingsModalStore.getState().setIsUserGuideModalOpen(false),
            }),
            coordinator.register({
                id: 'collection',
                priority: 'collection',
                canHandle: () => useCollectionNavigationStore.getState().snapshot !== null,
                handle: () => sourceRef.current.backCollection(),
            }),
            coordinator.register({
                id: 'player',
                priority: 'view',
                canHandle: () => sourceRef.current.view === 'player',
                handle: () => sourceRef.current.backFromPlayer(),
            }),
            coordinator.register({
                id: 'lattice',
                priority: 'view',
                canHandle: () => sourceRef.current.view === 'lattice',
                handle: () => sourceRef.current.backFromLattice(),
            }),
            // 兜底层：永远能消费。第一次只提示，窗口内第二次才真的退出。
            coordinator.register({
                id: EXIT_BACK_HANDLER_ID,
                priority: 'app',
                canHandle: () => true,
                handle: () => {
                    const now = Date.now();
                    if (now - armedAtRef.current < EXIT_CONFIRM_WINDOW_MS) {
                        armedAtRef.current = 0;
                        void exitNativeApp();
                        return;
                    }
                    armedAtRef.current = now;
                    setStatusMessage({ type: 'info', text: i18n.t('status.exitPressAgain') });
                },
            }),
        ];

        const onNativeBack = () => {
            const result = coordinator.dispatch();
            // 退掉了别的一层 ⇒ 上一次的「再按一次退出」作废，
            // 否则在窗口内退回一层再按返回就会直接退出 App。
            if (result.type === 'handled' && result.id !== EXIT_BACK_HANDLER_ID) {
                armedAtRef.current = 0;
            }
        };

        // 订阅是异步的（要动态 import 原生模块），卸载竞态交给 disposed 标记处理。
        let disposed = false;
        let unsubscribe: (() => void) | undefined;
        void subscribeNativeBackButton(onNativeBack).then((dispose) => {
            if (disposed) dispose();
            else unsubscribe = dispose;
        });

        return () => {
            disposed = true;
            unsubscribe?.();
            unregisterHandlers.forEach((unregister) => unregister());
        };
    }, [coordinator]);
};
