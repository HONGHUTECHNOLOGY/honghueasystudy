import type { AutomationScript } from '@honghu-desktop/app/src/scripts/script';

export type RawAutomationScript = Pick<AutomationScript, 'configs' | 'name' | 'icon'>;
