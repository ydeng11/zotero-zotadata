// Re-export BaseMetadataAPI from metadata feature
export { BaseMetadataAPI } from '@/features/metadata/apis/BaseMetadataAPI';
// Legacy alias for backward compatibility
export { BaseMetadataAPI as APIService } from '@/features/metadata/apis/BaseMetadataAPI';
export { DownloadManager } from './DownloadManager';
export { ResourceManager } from './ResourceManager';

// Note: Other services to be implemented in future phases:
// export { CacheService } from './CacheService'; 