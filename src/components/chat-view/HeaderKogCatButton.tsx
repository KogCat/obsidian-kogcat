import * as Popover from '@radix-ui/react-popover'
import { useTranslation } from 'react-i18next'

import { KogCatIcon } from '../icons/KogCatIcon'
import { SidebarPanel } from '../sidebar/SidebarPanel'

export function HeaderKogCatButton() {
  const { t } = useTranslation('sidebar')
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="clickable-icon" aria-label={t('title')}>
          <KogCatIcon size={18} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="cc-popover cc-sidebar-panel-popover"
          side="bottom"
          align="end"
          sideOffset={4}
        >
          <SidebarPanel />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
