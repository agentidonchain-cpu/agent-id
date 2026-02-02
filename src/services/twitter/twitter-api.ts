/**
 * AgentID - Twitter API Client
 *
 * Client for interacting with twitterapi.io to fetch and validate tweets.
 */

import { logger } from '../../utils/logger.js';
import type { TwitterTweet } from '../../types/verification.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const TWITTER_API_BASE = 'https://api.twitterapi.io';

/**
 * Get the Twitter API key from environment
 */
function getApiKey(): string {
  const apiKey = process.env.TWITTER_API_KEY;
  if (!apiKey) {
    throw new Error('TWITTER_API_KEY environment variable is not set');
  }
  return apiKey;
}

// =============================================================================
// API CLIENT
// =============================================================================

/**
 * Fetch a tweet by its ID
 */
export async function fetchTweetById(tweetId: string): Promise<TwitterTweet | null> {
  try {
    const apiKey = getApiKey();

    const response = await fetch(
      `${TWITTER_API_BASE}/twitter/tweets?tweet_ids=${tweetId}`,
      {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        { tweetId, status: response.status, error: errorText },
        'Twitter API request failed'
      );
      return null;
    }

    const data = await response.json() as { tweets?: any[]; data?: any[] };

    // twitterapi.io returns { tweets: [...] } or { data: [...] }
    const tweets = data.tweets || data.data || [];

    if (!tweets || tweets.length === 0) {
      logger.warn({ tweetId }, 'Tweet not found');
      return null;
    }

    const tweet = tweets[0];

    // Map the response to our TwitterTweet interface
    // twitterapi.io format may vary, handle common formats
    return {
      id: tweet.id || tweet.id_str || tweetId,
      text: tweet.text || tweet.full_text || '',
      author: {
        id: tweet.author?.id || tweet.user?.id_str || tweet.user?.id || '',
        userName: tweet.author?.userName || tweet.author?.username || tweet.user?.screen_name || '',
        displayName: tweet.author?.displayName || tweet.author?.name || tweet.user?.name,
      },
      createdAt: tweet.createdAt || tweet.created_at || new Date().toISOString(),
    };
  } catch (error) {
    logger.error({ tweetId, error }, 'Failed to fetch tweet');
    return null;
  }
}

/**
 * Validate that a tweet contains the expected verification code
 * and is authored by the expected user
 */
export function validateTweet(
  tweet: TwitterTweet,
  expectedCode: string,
  expectedHandle: string
): { valid: boolean; error?: string } {
  // Check if tweet text contains the code
  if (!tweet.text.includes(expectedCode)) {
    return {
      valid: false,
      error: `Tweet does not contain the verification code: ${expectedCode}`,
    };
  }

  // Check if the author matches the expected handle (case-insensitive)
  const tweetAuthor = tweet.author.userName.toLowerCase();
  const normalizedHandle = expectedHandle.toLowerCase().replace(/^@/, '');

  if (tweetAuthor !== normalizedHandle) {
    return {
      valid: false,
      error: `Tweet author "${tweet.author.userName}" does not match expected handle "${expectedHandle}"`,
    };
  }

  return { valid: true };
}

/**
 * Verify a tweet for Twitter verification flow
 * Returns the verified tweet data if successful
 */
export async function verifyTweet(
  tweetId: string,
  expectedCode: string,
  expectedHandle: string
): Promise<{
  verified: boolean;
  tweet?: TwitterTweet;
  error?: string;
}> {
  // Fetch the tweet
  const tweet = await fetchTweetById(tweetId);

  if (!tweet) {
    return {
      verified: false,
      error: 'Tweet not found. Make sure the tweet is public and the URL is correct.',
    };
  }

  // Validate the tweet
  const validation = validateTweet(tweet, expectedCode, expectedHandle);

  if (!validation.valid) {
    return {
      verified: false,
      tweet,
      error: validation.error,
    };
  }

  logger.info(
    {
      tweetId,
      handle: expectedHandle,
      userId: tweet.author.id,
    },
    'Tweet verified successfully'
  );

  return {
    verified: true,
    tweet,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export const twitterApiClient = {
  fetchTweetById,
  validateTweet,
  verifyTweet,
};

export default twitterApiClient;
