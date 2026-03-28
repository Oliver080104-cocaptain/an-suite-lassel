import { QueryClient } from '@tanstack/react-query';

export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			staleTime: 5 * 60 * 1000, // 5 Minuten - verhindert unnötige Refetches
			gcTime: 10 * 60 * 1000,   // 10 Minuten Cache
			retry: (failureCount, error) => {
				// Kein Retry bei 429 (Too Many Requests) oder 404
				if (error?.status === 429 || error?.status === 404) return false;
				return failureCount < 1;
			},
		},
		mutations: {
			retry: false,
		},
	},
});