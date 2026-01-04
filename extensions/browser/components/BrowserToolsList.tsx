'use client';

import {
  ChevronLeft,
  Wrench,
  Navigation,
  Eye,
  MousePointer,
  Layers,
  Camera,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/lib/store/chat-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';

/**
 * Browser Agent 사용 가능한 도구 목록 전체 화면
 */
export function BrowserToolsList() {
  const { setBrowserViewMode } = useChatStore();
  const { t } = useTranslation();

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="p-3 border-b bg-muted/30 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setBrowserViewMode('chat')}
          title={t('common.back')}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5" />
          <span className="text-base font-semibold">{t('browser.toolsList.title')}</span>
        </div>
      </div>

      {/* Tools List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="text-xs text-muted-foreground mb-3">
          {t('browser.toolsList.description')}
        </div>

        {/* Navigation Tools */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Navigation className="h-4 w-4" />
              <CardTitle className="text-sm">
                {t('browser.toolsList.categories.navigation')}
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              {t('browser.toolsList.categories.navigationDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <ToolItem name="browser_navigate" description={t('browser.toolsList.tools.navigate')} />
          </CardContent>
        </Card>

        {/* Page Inspection Tools */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              <CardTitle className="text-sm">
                {t('browser.toolsList.categories.pageInspection')}
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              {t('browser.toolsList.categories.pageInspectionDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <ToolItem
              name="get_page_content"
              description={t('browser.toolsList.tools.getPageContent')}
            />
            <ToolItem
              name="get_interactive_elements"
              description={t('browser.toolsList.tools.getInteractiveElements')}
            />
            <ToolItem
              name="search_elements"
              description={t('browser.toolsList.tools.searchElements')}
              badge="NEW"
            />
            <ToolItem
              name="get_selected_text"
              description={t('browser.toolsList.tools.getSelectedText')}
            />
            <ToolItem
              name="take_screenshot"
              description={t('browser.toolsList.tools.takeScreenshot')}
            />
          </CardContent>
        </Card>

        {/* Page Interaction Tools */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <MousePointer className="h-4 w-4" />
              <CardTitle className="text-sm">
                {t('browser.toolsList.categories.pageInteraction')}
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              {t('browser.toolsList.categories.pageInteractionDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <ToolItem
              name="click_element"
              description={t('browser.toolsList.tools.clickElement')}
            />
            <ToolItem name="type_text" description={t('browser.toolsList.tools.typeText')} />
            <ToolItem name="scroll" description={t('browser.toolsList.tools.scroll')} />
          </CardContent>
        </Card>

        {/* Tab Management Tools */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              <CardTitle className="text-sm">
                {t('browser.toolsList.categories.tabManagement')}
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              {t('browser.toolsList.categories.tabManagementDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <ToolItem name="list_tabs" description={t('browser.toolsList.tools.listTabs')} />
            <ToolItem name="create_tab" description={t('browser.toolsList.tools.createTab')} />
            <ToolItem name="switch_tab" description={t('browser.toolsList.tools.switchTab')} />
            <ToolItem name="close_tab" description={t('browser.toolsList.tools.closeTab')} />
          </CardContent>
        </Card>

        {/* Vision-based Tools */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4" />
              <CardTitle className="text-sm">{t('browser.toolsList.categories.vision')}</CardTitle>
            </div>
            <CardDescription className="text-xs">
              {t('browser.toolsList.categories.visionDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <ToolItem
              name="capture_annotated_screenshot"
              description={t('browser.toolsList.tools.captureAnnotatedScreenshot')}
              badge="NEW"
            />
            <ToolItem
              name="click_coordinate"
              description={t('browser.toolsList.tools.clickCoordinate')}
              badge="NEW"
            />
            <ToolItem
              name="click_marker"
              description={t('browser.toolsList.tools.clickMarker')}
              badge="NEW"
            />
            <ToolItem
              name="get_clickable_coordinate"
              description={t('browser.toolsList.tools.getClickableCoordinate')}
              badge="NEW"
            />
            <ToolItem
              name="analyze_with_vision"
              description={t('browser.toolsList.tools.analyzeWithVision')}
              badge="SOON"
            />
          </CardContent>
        </Card>

        {/* Google Search Tools */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              <CardTitle className="text-sm">
                {t('browser.toolsList.categories.googleSearch')}
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              {t('browser.toolsList.categories.googleSearchDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground mb-1">
              {t('browser.toolsList.categories.search')}
            </div>
            <ToolItem
              name="google_search"
              description={t('browser.toolsList.tools.googleSearch')}
              badge="NEW"
            />
            <ToolItem
              name="google_search_news"
              description={t('browser.toolsList.tools.googleSearchNews')}
              badge="NEW"
            />
            <ToolItem
              name="google_search_scholar"
              description={t('browser.toolsList.tools.googleSearchScholar')}
              badge="NEW"
            />
            <ToolItem
              name="google_search_images"
              description={t('browser.toolsList.tools.googleSearchImages')}
              badge="NEW"
            />
            <ToolItem
              name="google_search_advanced"
              description={t('browser.toolsList.tools.googleSearchAdvanced')}
              badge="NEW"
            />

            <div className="text-xs font-semibold text-muted-foreground mt-3 mb-1">
              {t('browser.toolsList.categories.extraction')}
            </div>
            <ToolItem
              name="google_extract_results"
              description={t('browser.toolsList.tools.googleExtractResults')}
              badge="NEW"
            />
            <ToolItem
              name="google_get_related_searches"
              description={t('browser.toolsList.tools.googleGetRelatedSearches')}
              badge="NEW"
            />

            <div className="text-xs font-semibold text-muted-foreground mt-3 mb-1">
              {t('browser.toolsList.categories.searchNavigation')}
            </div>
            <ToolItem
              name="google_visit_result"
              description={t('browser.toolsList.tools.googleVisitResult')}
              badge="NEW"
            />
            <ToolItem
              name="google_next_page"
              description={t('browser.toolsList.tools.googleNextPage')}
              badge="NEW"
            />
          </CardContent>
        </Card>

        {/* Info */}
        <div className="text-xs text-muted-foreground text-center p-4 bg-muted/20 rounded-lg">
          <p>{t('browser.toolsList.info.autoSelect')}</p>
          <p className="mt-1">{t('browser.toolsList.info.naturalLanguage')}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * 개별 도구 아이템 컴포넌트
 */
function ToolItem({
  name,
  description,
  badge,
}: {
  name: string;
  description: string;
  badge?: 'NEW' | 'SOON';
}) {
  return (
    <div className="text-xs p-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2 mb-1">
        <code className="font-mono font-semibold text-foreground">{name}</code>
        {badge === 'NEW' && (
          <Badge variant="default" className="h-4 text-[10px] px-1">
            NEW
          </Badge>
        )}
        {badge === 'SOON' && (
          <Badge variant="secondary" className="h-4 text-[10px] px-1">
            SOON
          </Badge>
        )}
      </div>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}
