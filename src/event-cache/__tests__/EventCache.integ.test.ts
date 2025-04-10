import { EventCache } from '../EventCache';
import { advanceTo } from 'jest-date-mock';
import * as Utils from '../../test-utils/test-utils';
import { RumEvent } from '../../dispatch/dataplane';
import { DEFAULT_CONFIG, mockFetch } from '../../test-utils/test-utils';
import { SESSION_START_EVENT_TYPE } from '../../sessions/SessionManager';
import { INSTALL_MODULE } from '../../utils/constants';

const WEB_CLIENT_VERSION = '1.22.0';

global.fetch = mockFetch;
describe('EventCache tests', () => {
    beforeAll(() => {
        advanceTo(0);
    });

    test('when a session expires then a new session is created', async () => {
        // Init
        const EVENT1_SCHEMA = 'com.amazon.rum.event1';
        const config = {
            ...DEFAULT_CONFIG,
            ...{
                allowCookies: true,
                sessionLengthSeconds: 0
            }
        };

        const eventCache: EventCache = Utils.createEventCache(config);

        // Run
        eventCache.recordEvent(EVENT1_SCHEMA, {});
        advanceTo(1);
        eventCache.recordEvent(EVENT1_SCHEMA, {});

        // Assert
        expect(
            eventCache
                .getEventBatch()
                .filter((e) => e.type === SESSION_START_EVENT_TYPE).length
        ).toEqual(2);
    });

    test('meta data contains domain, user agent and page ID', async () => {
        // Init
        const EVENT1_SCHEMA = 'com.amazon.rum.event1';
        const config = {
            ...DEFAULT_CONFIG,
            ...{
                allowCookies: false,
                sessionLengthSeconds: 0
            }
        };

        const eventCache: EventCache = Utils.createEventCache(config);
        const expectedMetaData = {
            version: '1.0.0',
            'aws:client': INSTALL_MODULE,
            'aws:clientVersion': WEB_CLIENT_VERSION,
            domain: 'us-east-1.console.aws.amazon.com',
            browserLanguage: 'en-US',
            browserName: 'WebKit',
            deviceType: 'desktop',
            platformType: 'web',
            pageId: '/console/home'
        };

        // Run
        eventCache.recordPageView('/console/home');
        eventCache.recordEvent(EVENT1_SCHEMA, {});

        // Assert
        const events: RumEvent[] = eventCache.getEventBatch();
        events.forEach((event) => {
            expect(JSON.parse(event.metadata)).toMatchObject(expectedMetaData);
        });
    });

    test('default meta data can be overriden by custom attributes', async () => {
        // Init
        const EVENT1_SCHEMA = 'com.amazon.rum.event1';
        const config = {
            ...DEFAULT_CONFIG,
            ...{
                allowCookies: false,
                sessionLengthSeconds: 0,
                sessionAttributes: {
                    version: '2.0.0',
                    domain: 'overridden.console.aws.amazon.com',
                    browserLanguage: 'en-UK',
                    browserName: 'Chrome',
                    deviceType: 'Mac',
                    platformType: 'other'
                }
            }
        };

        const eventCache: EventCache = Utils.createEventCache(config);
        const expectedMetaData = {
            version: '1.0.0',
            'aws:client': INSTALL_MODULE,
            'aws:clientVersion': WEB_CLIENT_VERSION,
            domain: 'overridden.console.aws.amazon.com',
            browserLanguage: 'en-UK',
            browserName: 'Chrome',
            deviceType: 'Mac',
            platformType: 'other',
            pageId: '/console/home'
        };

        // Run
        eventCache.recordPageView('/console/home');
        eventCache.recordEvent(EVENT1_SCHEMA, {});

        // Assert
        const events: RumEvent[] = eventCache.getEventBatch();
        events.forEach((event) => {
            expect(JSON.parse(event.metadata)).toMatchObject(expectedMetaData);
        });
    });

    test('when a session is not sampled then return false', async () => {
        // Init
        const config = {
            ...DEFAULT_CONFIG,
            ...{
                sessionSampleRate: 0
            }
        };

        const eventCache: EventCache = Utils.createEventCache(config);

        // Assert
        expect(eventCache.isSessionSampled()).toBeFalsy();
    });

    test('when a session is sampled then return true', async () => {
        // Init
        const config = {
            ...DEFAULT_CONFIG
        };

        const eventCache: EventCache = Utils.createEventCache(config);

        // Assert
        expect(eventCache.isSessionSampled()).toBeTruthy();
    });
});
