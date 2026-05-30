/**
 * Google Analytics Event Tracking Utility
 * Tracks key user actions in Stumble Chat
 */

// Check if gtag is available
const isGtagAvailable = () => typeof window !== 'undefined' && typeof window.gtag === 'function';

/**
 * Track a custom event in Google Analytics
 * @param {string} eventName - Name of the event
 * @param {object} params - Event parameters
 */
export const trackEvent = (eventName, params = {}) => {
  if (isGtagAvailable()) {
    window.gtag('event', eventName, params);
    if (process.env.NODE_ENV === 'development') {
      console.log(`[GA] Event: ${eventName}`, params);
    }
  }
};

// Pre-defined events for Stumble Chat
export const Analytics = {
  // Connection events
  userConnected: () => trackEvent('user_connected', {
    event_category: 'connection',
    event_label: 'socket_connected'
  }),
  
  userDisconnected: () => trackEvent('user_disconnected', {
    event_category: 'connection',
    event_label: 'socket_disconnected'
  }),
  
  // Chat events
  joinQueue: () => trackEvent('join_queue', {
    event_category: 'chat',
    event_label: 'searching_for_match'
  }),
  
  matchFound: (partnerName) => trackEvent('match_found', {
    event_category: 'chat',
    event_label: 'matched_with_user'
  }),
  
  messageSent: () => trackEvent('message_sent', {
    event_category: 'chat',
    event_label: 'text_message'
  }),
  
  messageReceived: () => trackEvent('message_received', {
    event_category: 'chat',
    event_label: 'text_message'
  }),
  
  photoSent: () => trackEvent('photo_sent', {
    event_category: 'chat',
    event_label: 'photo_shared'
  }),
  
  photoReceived: () => trackEvent('photo_received', {
    event_category: 'chat',
    event_label: 'photo_received'
  }),
  
  photoViewed: () => trackEvent('photo_viewed', {
    event_category: 'chat',
    event_label: 'photo_opened'
  }),
  
  // User actions
  skipChat: () => trackEvent('skip_chat', {
    event_category: 'user_action',
    event_label: 'skipped_partner'
  }),
  
  disconnectChat: () => trackEvent('disconnect_chat', {
    event_category: 'user_action',
    event_label: 'ended_chat'
  }),
  
  reportUser: () => trackEvent('report_user', {
    event_category: 'user_action',
    event_label: 'reported_partner'
  }),
  
  // Page views
  pageView: (pageName) => trackEvent('page_view', {
    event_category: 'navigation',
    page_title: pageName
  }),
  
  // Session tracking
  sessionStart: () => trackEvent('session_start', {
    event_category: 'session',
    event_label: 'app_opened'
  }),
  
  chatDuration: (seconds) => trackEvent('chat_duration', {
    event_category: 'engagement',
    value: seconds
  })
};

export default Analytics;
