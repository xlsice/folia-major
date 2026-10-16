import React from 'react';
import { Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SettingsAnchor } from './navigation/SettingsAnchorContext';
import SettingsSectionHeading from './navigation/SettingsSectionHeading';
// src/components/modal/settings/OpenSourceLicenseSection.tsx
// AGPL-3.0 §5(b) 的「显著声明」落点：作品整体以 AGPL-3.0 发布，许可证无附加条款。
//
// 为什么放进设置页而不是只写在发布页脚：§5 要求 notice 是「prominent」的——必须出现在作品本身
// （即 APK）里，不能只存在于 GitHub Release 说明这种可以随时删掉的外部位置。所以这一段是
// 编译进包的静态文本，不读配置、不可关闭、不随构建裁剪。
//
// §5(a)（声明已作修改 + 日期）和 §6(d)（二进制同处提供对应源码）一并在这里满足，避免同一组
// 声明散在几个地方互相漂移。上游 LICENSE 原文不在此处展示，只给链接，避免误读成我们改写了它。

/** 二开工作的起点。见 docs/dev/AGENTS.md 的事实快照 2026-10-13。 */
const MODIFIED_SINCE = '2026-10-13';

/** 对应源码仓库。AGPL §6 要求二进制与源码在同一「指定位置」可得，所以这里指到发布 APK 的那个仓库。 */
const SOURCE_URL = 'https://github.com/xlsice/folia-major';
const LICENSE_URL = 'https://github.com/xlsice/folia-major/blob/Android/LICENSE';

/**
 * Electron 里 <a target="_blank"> 会开新的 BrowserWindow，必须走主进程交给系统浏览器；
 * 安卓壳与网页版没有这条通道，回落到 window.open（与 grid/account/QrLoginFailureHelp 同一套路）。
 */
const openExternal = (url: string) => {
    if (window.electron?.openExternalUrl) {
        void window.electron.openExternalUrl(url);
        return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
};

/** 构建常量只在 vite 构建里存在；单测等没有它们的环境一律显示 'dev' / 'unknown'。 */
const buildProvenance = () => ({
    version: typeof __APP_VERSION__ === 'undefined' ? 'dev' : __APP_VERSION__,
    branch: typeof __GIT_BRANCH__ === 'undefined' ? 'unknown' : __GIT_BRANCH__,
    commit: typeof __COMMIT_HASH__ === 'undefined' ? 'dev' : __COMMIT_HASH__,
});

type OpenSourceLicenseSectionProps = {
    settingsCardClass: string;
    utilityGhostButtonClass: string;
};

const OpenSourceLicenseSection: React.FC<OpenSourceLicenseSectionProps> = ({
    settingsCardClass,
    utilityGhostButtonClass,
}) => {
    const { t } = useTranslation();
    const build = buildProvenance();

    return (
        <SettingsAnchor anchorId="openSourceLicense" label={t('options.openSourceLicense')}>
            <SettingsSectionHeading icon={Scale} label={t('options.openSourceLicense')} divider />

            <div className={`rounded-xl border ${settingsCardClass} p-4 space-y-3`}>
                <p className="text-[11px] leading-relaxed text-left" style={{ color: 'var(--text-secondary)' }}>
                    {t('options.openSourceLicenseNotice', { date: MODIFIED_SINCE })}
                </p>

                <p className="text-[11px] leading-relaxed text-left opacity-70" style={{ color: 'var(--text-secondary)' }}>
                    {t('options.openSourceLicenseSourceHint')}
                </p>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => openExternal(SOURCE_URL)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${utilityGhostButtonClass}`}
                        style={{ color: 'var(--text-primary)' }}
                    >
                        {t('options.openSourceLicenseSourceCta')}
                    </button>
                    <button
                        type="button"
                        onClick={() => openExternal(LICENSE_URL)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${utilityGhostButtonClass}`}
                        style={{ color: 'var(--text-primary)' }}
                    >
                        {t('options.openSourceLicenseTextCta')}
                    </button>
                </div>

                {/* §6(d) 原文要求「在二进制旁边清楚地指明去哪里取对应源码」。安卓壳里外链不一定
                    打得开，所以 URL 同时以纯文本呈现，用户可长按复制，不必依赖链接可用性。 */}
                <p
                    className="text-[11px] font-mono break-all text-left opacity-70"
                    style={{ color: 'var(--text-secondary)' }}
                    data-license-source-url={SOURCE_URL}
                >
                    {SOURCE_URL}
                </p>

                <p
                    className="text-[10px] font-mono text-left opacity-60"
                    style={{ color: 'var(--text-secondary)' }}
                    data-license-build={build.commit}
                >
                    {t('options.openSourceLicenseBuildLine', build)}
                </p>
            </div>
        </SettingsAnchor>
    );
};

export default OpenSourceLicenseSection;
