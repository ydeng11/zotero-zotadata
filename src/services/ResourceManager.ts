import { ErrorManager, ErrorType } from '@/core';
import type { Resource } from '@/core/types';

/**
 * Resource types for tracking different kinds of resources
 */
export type ResourceType = 'blob' | 'file' | 'timer' | 'request' | 'event' | 'custom';

/**
 * Resource with metadata
 */
interface ManagedResource extends Resource {
  id: string;
  type: ResourceType;
  description?: string;
  createdAt: number;
  lastAccessed: number;
}

/**
 * Resource group for batch operations
 */
interface ResourceGroup {
  id: string;
  name: string;
  resources: Set<string>;
  createdAt: number;
}

/**
 * Cleanup statistics
 */
interface CleanupStats {
  total: number;
  successful: number;
  failed: number;
  errors: string[];
}

/**
 * Resource manager for automatic cleanup and memory management
 */
export class ResourceManager {
  private resources = new Map<string, ManagedResource>();
  private groups = new Map<string, ResourceGroup>();
  private errorManager: ErrorManager;
  private cleanupTimer?: NodeJS.Timeout;
  private nextResourceId = 1;
  private nextGroupId = 1;

  // Configuration
  private readonly maxAge = 30 * 60 * 1000; // 30 minutes
  private readonly cleanupInterval = 5 * 60 * 1000; // 5 minutes
  private readonly maxResources = 1000;

  constructor() {
    this.errorManager = new ErrorManager();
    this.startPeriodicCleanup();
  }

  /**
   * Track a resource for automatic cleanup
   */
  track<T extends Resource>(resource: T, type: ResourceType = 'custom', description?: string): T {
    const id = `resource_${this.nextResourceId++}`;
    const now = Date.now();

    const managedResource: ManagedResource = {
      ...resource,
      id,
      type,
      description,
      createdAt: now,
      lastAccessed: now,
    };

    this.resources.set(id, managedResource);

    // Prevent memory leaks by enforcing max resources
    if (this.resources.size > this.maxResources) {
      this.cleanupOldestResources(100); // Remove oldest 100 resources
    }

    return resource;
  }

  /**
   * Track a blob URL for cleanup
   */
  trackBlobUrl(blobUrl: string, description?: string): string {
    const resource: Resource = {
      cleanup: () => {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch (error) {
          // Ignore errors - URL might already be revoked
        }
      },
    };

    this.track(resource, 'blob', description || `Blob URL: ${blobUrl.substring(0, 50)}...`);
    return blobUrl;
  }

  /**
   * Track a timer for cleanup
   */
  trackTimer(timerId: NodeJS.Timeout, description?: string): NodeJS.Timeout {
    const resource: Resource = {
      cleanup: () => {
        clearTimeout(timerId);
      },
    };

    this.track(resource, 'timer', description || 'Timer');
    return timerId;
  }

  /**
   * Track an AbortController for cleanup
   */
  trackAbortController(controller: AbortController, description?: string): AbortController {
    const resource: Resource = {
      cleanup: () => {
        if (!controller.signal.aborted) {
          controller.abort();
        }
      },
    };

    this.track(resource, 'request', description || 'AbortController');
    return controller;
  }

  /**
   * Track an event listener for cleanup
   */
  trackEventListener(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions
  ): void {
    const resource: Resource = {
      cleanup: () => {
        target.removeEventListener(type, listener, options);
      },
    };

    this.track(resource, 'event', `Event listener: ${type}`);
  }

  /**
   * Create a resource group for batch tracking
   */
  createGroup(name: string): string {
    const id = `group_${this.nextGroupId++}`;
    
    this.groups.set(id, {
      id,
      name,
      resources: new Set(),
      createdAt: Date.now(),
    });

    return id;
  }

  /**
   * Add resource to a group
   */
  addToGroup(groupId: string, resource: Resource, type: ResourceType = 'custom', description?: string): void {
    const group = this.groups.get(groupId);
    if (!group) {
      throw this.errorManager.createError(
        ErrorType.VALIDATION_ERROR,
        `Group ${groupId} not found`,
        { groupId }
      );
    }

    const trackedResource = this.track(resource, type, description);
    const resourceId = this.findResourceId(trackedResource);
    
    if (resourceId) {
      group.resources.add(resourceId);
    }
  }

  /**
   * Clean up all resources in a group
   */
  async cleanupGroup(groupId: string): Promise<CleanupStats> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw this.errorManager.createError(
        ErrorType.VALIDATION_ERROR,
        `Group ${groupId} not found`,
        { groupId }
      );
    }

    const stats: CleanupStats = {
      total: group.resources.size,
      successful: 0,
      failed: 0,
      errors: [],
    };

         const cleanupPromises = Array.from(group.resources).map(async (resourceId) => {
       try {
         await this.cleanupResource(resourceId);
         stats.successful++;
       } catch (error: any) {
         stats.failed++;
         stats.errors.push(`Resource ${resourceId}: ${error?.message || 'Unknown error'}`);
       }
     });

    await Promise.allSettled(cleanupPromises);
    
    // Remove the group
    this.groups.delete(groupId);

    return stats;
  }

  /**
   * Access a resource (updates last accessed time)
   */
  access(resourceId: string): void {
    const resource = this.resources.get(resourceId);
    if (resource) {
      resource.lastAccessed = Date.now();
    }
  }

  /**
   * Manually cleanup a specific resource
   */
  async cleanupResource(resourceId: string): Promise<void> {
    const resource = this.resources.get(resourceId);
    if (!resource) return;

    try {
      if (typeof resource.cleanup === 'function') {
        await resource.cleanup();
      }
    } catch (error) {
      const contextualError = this.errorManager.createFromUnknown(
        error,
        ErrorType.FILE_ERROR,
        { operation: 'cleanupResource', resourceId, type: resource.type }
      );
      throw contextualError;
    } finally {
      this.resources.delete(resourceId);
    }
  }

  /**
   * Clean up all resources
   */
  async cleanup(): Promise<CleanupStats> {
    const stats: CleanupStats = {
      total: this.resources.size,
      successful: 0,
      failed: 0,
      errors: [],
    };

    // Stop periodic cleanup
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

         // Clean up all resources
     const cleanupPromises = Array.from(this.resources.keys()).map(async (resourceId) => {
       try {
         await this.cleanupResource(resourceId);
         stats.successful++;
       } catch (error: any) {
         stats.failed++;
         stats.errors.push(`Resource ${resourceId}: ${error?.message || 'Unknown error'}`);
       }
     });

    await Promise.allSettled(cleanupPromises);

    // Clean up groups
    this.groups.clear();

    return stats;
  }

  /**
   * Clean up old or unused resources
   */
  async cleanupStaleResources(): Promise<CleanupStats> {
    const now = Date.now();
    const staleResources = Array.from(this.resources.entries())
      .filter(([_, resource]) => now - resource.lastAccessed > this.maxAge)
      .map(([id, _]) => id);

    const stats: CleanupStats = {
      total: staleResources.length,
      successful: 0,
      failed: 0,
      errors: [],
    };

         for (const resourceId of staleResources) {
       try {
         await this.cleanupResource(resourceId);
         stats.successful++;
       } catch (error: any) {
         stats.failed++;
         stats.errors.push(`Resource ${resourceId}: ${error?.message || 'Unknown error'}`);
       }
     }

    return stats;
  }

  /**
   * Get resource statistics
   */
  getStats(): {
    totalResources: number;
    totalGroups: number;
    resourcesByType: Record<ResourceType, number>;
    oldestResource?: { id: string; age: number };
    memoryUsage: number;
  } {
    const now = Date.now();
    const resourcesByType: Record<ResourceType, number> = {
      blob: 0,
      file: 0,
      timer: 0,
      request: 0,
      event: 0,
      custom: 0,
    };

    let oldestResource: { id: string; age: number } | undefined;

    for (const [id, resource] of this.resources) {
      resourcesByType[resource.type]++;
      
      const age = now - resource.createdAt;
      if (!oldestResource || age > oldestResource.age) {
        oldestResource = { id, age };
      }
    }

    return {
      totalResources: this.resources.size,
      totalGroups: this.groups.size,
      resourcesByType,
      oldestResource,
      memoryUsage: this.estimateMemoryUsage(),
    };
  }

  /**
   * List all resources (for debugging)
   */
  listResources(): Array<{
    id: string;
    type: ResourceType;
    description?: string;
    age: number;
    lastAccessed: number;
  }> {
    const now = Date.now();
    return Array.from(this.resources.values()).map(resource => ({
      id: resource.id,
      type: resource.type,
      description: resource.description,
      age: now - resource.createdAt,
      lastAccessed: resource.lastAccessed,
    }));
  }

  /**
   * Start periodic cleanup of stale resources
   */
  private startPeriodicCleanup(): void {
    this.cleanupTimer = setInterval(async () => {
      try {
        await this.cleanupStaleResources();
      } catch (error) {
        // Log error but don't throw
        console.error('Periodic resource cleanup failed:', error);
      }
    }, this.cleanupInterval);
  }

  /**
   * Clean up oldest resources when limit is exceeded
   */
  private async cleanupOldestResources(count: number): Promise<void> {
    const sorted = Array.from(this.resources.entries())
      .sort(([_, a], [__, b]) => a.lastAccessed - b.lastAccessed)
      .slice(0, count);

    for (const [resourceId, _] of sorted) {
      try {
        await this.cleanupResource(resourceId);
      } catch (error) {
        // Continue cleanup even if individual resources fail
      }
    }
  }

  /**
   * Find resource ID by resource reference
   */
  private findResourceId(targetResource: Resource): string | undefined {
    for (const [id, resource] of this.resources) {
      if (resource === targetResource) {
        return id;
      }
    }
    return undefined;
  }

  /**
   * Estimate memory usage (rough approximation)
   */
  private estimateMemoryUsage(): number {
    let usage = 0;
    
    // Base overhead per resource (rough estimate)
    usage += this.resources.size * 200; // bytes per resource object
    
    // Group overhead
    usage += this.groups.size * 100;
    
    // Add string lengths for descriptions
    for (const resource of this.resources.values()) {
      if (resource.description) {
        usage += resource.description.length * 2; // UTF-16
      }
    }

    return usage;
  }
} 