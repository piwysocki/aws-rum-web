import { InternalPlugin } from '../InternalPlugin';
import { LargestContentfulPaintEvent } from '../../events/largest-contentful-paint-event';
import { CumulativeLayoutShiftEvent } from '../../events/cumulative-layout-shift-event';
import { FirstInputDelayEvent } from '../../events/first-input-delay-event';
import { InteractionToNextPaintEvent } from '../../events/interaction-to-next-paint';
import {
    CLSMetricWithAttribution,
    FIDMetricWithAttribution,
    INPMetricWithAttribution,
    LCPMetricWithAttribution,
    Metric,
    onCLS,
    onFID,
    onLCP,
    onINP
} from 'web-vitals/attribution';
import {
    CLS_EVENT_TYPE,
    FID_EVENT_TYPE,
    INP_EVENT_TYPE,
    LCP_EVENT_TYPE,
    PERFORMANCE_NAVIGATION_EVENT_TYPE,
    PERFORMANCE_RESOURCE_EVENT_TYPE
} from '../utils/constant';
import { Topic } from '../../event-bus/EventBus';
import { ParsedRumEvent } from '../../dispatch/dataplane';
import { ResourceEvent } from '../../events/resource-event';
import {
    HasLatency,
    ResourceType,
    performanceKey,
    RumLCPAttribution,
    isLCPSupported
} from '../../utils/common-utils';
import {
    PerformancePluginConfig,
    defaultPerformancePluginConfig
} from '../../plugins/utils/performance-utils';

export const WEB_VITAL_EVENT_PLUGIN_ID = 'web-vitals';

export class WebVitalsPlugin extends InternalPlugin {
    private config: PerformancePluginConfig;
    constructor(config?: Partial<PerformancePluginConfig>) {
        super(WEB_VITAL_EVENT_PLUGIN_ID);
        this.config = { ...defaultPerformancePluginConfig, ...config };
    }
    private resourceEventIds = new Map<string, string>();
    private navigationEventId?: string;
    private cacheLCPCandidates = isLCPSupported();

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    enable(): void {}

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    disable(): void {}

    protected onload(): void {
        this.context.eventBus.subscribe(Topic.EVENT, this.handleEvent); // eslint-disable-line @typescript-eslint/unbound-method
        onLCP((metric) => this.handleLCP(metric), {
            reportAllChanges: this.config.reportAllLCP
        });
        onFID((metric) => this.handleFID(metric));
        onCLS((metric) => this.handleCLS(metric), {
            reportAllChanges: true
        });
        onINP((metric) => this.handleINP(metric), { reportAllChanges: true });
    }

    private handleEvent = (event: ParsedRumEvent) => {
        switch (event.type) {
            // lcp resource is either image or text
            case PERFORMANCE_RESOURCE_EVENT_TYPE:
                const details = event.details as ResourceEvent;
                if (
                    this.cacheLCPCandidates &&
                    details.fileType === ResourceType.IMAGE
                ) {
                    this.resourceEventIds.set(
                        performanceKey(event.details as HasLatency),
                        event.id
                    );
                }
                break;
            case PERFORMANCE_NAVIGATION_EVENT_TYPE:
                this.navigationEventId = event.id;
                break;
        }
    };

    private handleLCP(metric: LCPMetricWithAttribution | Metric) {
        const a = (metric as LCPMetricWithAttribution).attribution;
        const attribution: RumLCPAttribution = {
            element: a.element,
            url: a.url,
            timeToFirstByte: a.timeToFirstByte,
            resourceLoadDelay: a.resourceLoadDelay,
            /**
             * `resourceLoadTime` was renamed to `resourceLoadDuration` in web-vitals 4.x
             * This is a cosmetic change, and does not affect the underlying value.
             * We can update the name to `resourceLoadDuration` in RUM's next major version.
             * (See https://github.com/GoogleChrome/web-vitals/pull/450)
             */
            resourceLoadTime: a.resourceLoadDuration,
            // See https://github.com/GoogleChrome/web-vitals/pull/450
            elementRenderDelay: a.elementRenderDelay
        };
        if (a.lcpResourceEntry) {
            const key = performanceKey(a.lcpResourceEntry as HasLatency);
            attribution.lcpResourceEntry = this.resourceEventIds.get(key);
        }
        if (this.navigationEventId) {
            attribution.navigationEntry = this.navigationEventId;
        }
        this.context?.record(LCP_EVENT_TYPE, {
            version: '1.0.0',
            value: metric.value,
            attribution
        } as LargestContentfulPaintEvent);

        // teardown
        this.context?.eventBus.unsubscribe(Topic.EVENT, this.handleEvent); // eslint-disable-line
        this.resourceEventIds.clear();
        this.navigationEventId = undefined;
    }

    private handleCLS(metric: CLSMetricWithAttribution | Metric) {
        const a = (metric as CLSMetricWithAttribution).attribution;
        const { record, recordCandidate } = this.context;
        (this.config.reportAllCLS ? record : recordCandidate)(CLS_EVENT_TYPE, {
            version: '1.0.0',
            value: metric.value,
            attribution: {
                largestShiftTarget: a.largestShiftTarget,
                largestShiftValue: a.largestShiftValue,
                largestShiftTime: a.largestShiftTime,
                loadState: a.loadState
            }
        } as CumulativeLayoutShiftEvent);
    }

    private handleFID(metric: FIDMetricWithAttribution | Metric) {
        const a = (metric as FIDMetricWithAttribution).attribution;
        this.context?.record(FID_EVENT_TYPE, {
            version: '1.0.0',
            value: metric.value,
            attribution: {
                eventTarget: a.eventTarget,
                eventType: a.eventType,
                eventTime: a.eventTime,
                loadState: a.loadState
            }
        } as FirstInputDelayEvent);
    }

    private handleINP(metric: INPMetricWithAttribution | Metric) {
        const a = (metric as INPMetricWithAttribution).attribution;
        const { record, recordCandidate } = this.context;
        (this.config.reportAllINP ? record : recordCandidate)(INP_EVENT_TYPE, {
            version: '1.0.0',
            value: metric.value,
            attribution: {
                interactionTarget: a.interactionTarget,
                interactionTime: a.interactionTime,
                nextPaintTime: a.nextPaintTime,
                interactionType: a.interactionType,
                inputDelay: a.inputDelay,
                processingDuration: a.processingDuration,
                presentationDelay: a.presentationDelay,
                loadState: a.loadState
            }
        } as InteractionToNextPaintEvent);
    }
}
