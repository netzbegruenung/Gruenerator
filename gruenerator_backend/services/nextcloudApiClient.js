import axios from 'axios';

class NextcloudApiClient {
    constructor(shareLink) {
        this.shareLink = shareLink;
        this.parsedLink = this.parseShareLink(shareLink);
        
        if (!this.parsedLink) {
            throw new Error('Invalid Nextcloud share link format');
        }
        
        this.baseURL = this.parsedLink.baseUrl;
        this.shareToken = this.parsedLink.shareToken;
        this.webdavUrl = `${this.baseURL}/public.php/webdav`;
        
        // Create axios instance with basic authentication using share token
        this.axiosInstance = axios.create({
            timeout: 30000, // 30 seconds timeout
            headers: {
                'User-Agent': 'Gruenerator/1.0',
                'Content-Type': 'application/octet-stream'
            }
        });
        
        // Set basic auth with share token (username = token, password = empty)
        this.axiosInstance.defaults.auth = {
            username: this.shareToken,
            password: ''
        };
        
        // Add response interceptor for error handling
        this.axiosInstance.interceptors.response.use(
            response => response,
            error => {
                console.error('[NextcloudApiClient] Nextcloud API error:', error.message, {
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    data: error.response?.data,
                    url: error.config?.url
                });
                return Promise.reject(this.normalizeError(error));
            }
        );
        
        console.log('[NextcloudApiClient] NextcloudApiClient initialized', {
            baseUrl: this.baseURL,
            shareToken: this.shareToken.substring(0, 8) + '...'
        });
    }
    
    /**
     * Parse Nextcloud share link to extract components
     */
    parseShareLink(shareLink) {
        try {
            const urlObj = new URL(shareLink);
            const pathMatch = urlObj.pathname.match(/\/s\/([A-Za-z0-9]+)/);
            
            if (!pathMatch) {
                return null;
            }
            
            return {
                baseUrl: `${urlObj.protocol}//${urlObj.host}`,
                shareToken: pathMatch[1],
                fullPath: urlObj.pathname + urlObj.search
            };
        } catch (error) {
            console.error('[NextcloudApiClient] Error parsing share link', { shareLink, error: error.message });
            return null;
        }
    }
    
    /**
     * Test connection to the Nextcloud share
     */
    async testConnection() {
        try {
            console.log('[NextcloudApiClient] Testing Nextcloud connection');
            
            // Try to access the WebDAV root to test authentication
            const response = await this.axiosInstance.request({
                method: 'PROPFIND',
                url: this.webdavUrl,
                headers: {
                    'Depth': '0',
                    'Content-Type': 'application/xml'
                },
                data: `<?xml version="1.0" encoding="utf-8" ?>
                       <propfind xmlns="DAV:">
                           <prop>
                               <resourcetype/>
                               <getcontentlength/>
                               <getlastmodified/>
                           </prop>
                       </propfind>`
            });
            
            if (response.status === 207 || response.status === 200) {
                console.log('[NextcloudApiClient] Connection test successful');
                return {
                    success: true,
                    message: 'Connection successful',
                    writable: true // Assume writable for now, could be enhanced
                };
            }
            
            return {
                success: false,
                message: `Unexpected response: ${response.status}`
            };
            
        } catch (error) {
            console.error('[NextcloudApiClient] Connection test failed', { error: error.message });
            
            if (error.response?.status === 401) {
                return {
                    success: false,
                    message: 'Authentication failed - invalid share token'
                };
            } else if (error.response?.status === 403) {
                return {
                    success: false,
                    message: 'Access forbidden - share may not be active or writable'
                };
            } else if (error.response?.status === 404) {
                return {
                    success: false,
                    message: 'Share not found - check the share link'
                };
            }
            
            return {
                success: false,
                message: error.message || 'Connection test failed'
            };
        }
    }
    
    /**
     * Upload a file to the Nextcloud share
     */
    async uploadFile(content, filename) {
        try {
            console.log('[NextcloudApiClient] Uploading file to Nextcloud', { filename, contentLength: content.length });
            
            // Ensure filename is safe
            const safeFilename = this.sanitizeFilename(filename);
            const uploadUrl = `${this.webdavUrl}/${encodeURIComponent(safeFilename)}`;
            
            const response = await this.axiosInstance.put(uploadUrl, content, {
                headers: {
                    'Content-Type': 'text/plain',
                    'Content-Length': Buffer.byteLength(content, 'utf8')
                }
            });
            
            if (response.status === 201 || response.status === 204) {
                console.log('[NextcloudApiClient] File uploaded successfully', { 
                    filename: safeFilename, 
                    status: response.status 
                });
                
                return {
                    success: true,
                    message: 'File uploaded successfully',
                    filename: safeFilename,
                    url: this.generateFileUrl(safeFilename)
                };
            }
            
            return {
                success: false,
                message: `Upload failed with status: ${response.status}`
            };
            
        } catch (error) {
            console.error('[NextcloudApiClient] File upload failed', { 
                filename, 
                error: error.message,
                status: error.response?.status 
            });
            
            if (error.response?.status === 401) {
                throw new Error('Authentication failed - invalid share token');
            } else if (error.response?.status === 403) {
                throw new Error('Upload forbidden - share is not writable');
            } else if (error.response?.status === 404) {
                throw new Error('Share not found - check the share link');
            } else if (error.response?.status === 507) {
                throw new Error('Insufficient storage space in Nextcloud');
            }
            
            throw new Error(error.message || 'File upload failed');
        }
    }
    
    /**
     * Get information about the share
     */
    async getShareInfo() {
        try {
            console.log('[NextcloudApiClient] Getting share information');
            
            const response = await this.axiosInstance.request({
                method: 'PROPFIND',
                url: this.webdavUrl,
                headers: {
                    'Depth': '1',
                    'Content-Type': 'application/xml'
                },
                data: `<?xml version="1.0" encoding="utf-8" ?>
                       <propfind xmlns="DAV:">
                           <prop>
                               <resourcetype/>
                               <getcontentlength/>
                               <getlastmodified/>
                               <displayname/>
                           </prop>
                       </propfind>`
            });
            
            if (response.status === 207) {
                // Parse WebDAV XML response (simplified)
                const files = this.parseWebDAVResponse(response.data);
                
                return {
                    success: true,
                    files: files,
                    totalFiles: files.length
                };
            }
            
            return {
                success: false,
                message: 'Failed to get share information'
            };
            
        } catch (error) {
            console.error('[NextcloudApiClient] Failed to get share info', { error: error.message });
            throw new Error(error.message || 'Failed to get share information');
        }
    }
    
    /**
     * Sanitize filename for safe upload
     */
    sanitizeFilename(filename) {
        // Remove or replace unsafe characters
        return filename
            .replace(/[<>:"/\\|?*]/g, '_')  // Replace unsafe chars with underscore
            .replace(/\.\./g, '_')          // Replace .. with underscore
            .replace(/^\./, '_')            // Replace leading dot
            .trim();
    }
    
    /**
     * Generate public URL for uploaded file
     */
    generateFileUrl(filename) {
        const encodedFilename = encodeURIComponent(filename);
        return `${this.baseURL}/s/${this.shareToken}/download?path=%2F&files=${encodedFilename}`;
    }
    
    /**
     * Parse WebDAV XML response (simplified parser)
     */
    parseWebDAVResponse(xmlData) {
        // This is a simplified parser - in production you might want to use a proper XML parser
        const files = [];
        
        try {
            // Extract file information from XML (basic regex parsing)
            const responseMatches = xmlData.match(/<d:response[^>]*>(.*?)<\/d:response>/gs);
            
            if (responseMatches) {
                responseMatches.forEach(responseXml => {
                    const hrefMatch = responseXml.match(/<d:href[^>]*>(.*?)<\/d:href>/);
                    const displayNameMatch = responseXml.match(/<d:displayname[^>]*>(.*?)<\/d:displayname>/);
                    const contentLengthMatch = responseXml.match(/<d:getcontentlength[^>]*>(.*?)<\/d:getcontentlength>/);
                    const lastModifiedMatch = responseXml.match(/<d:getlastmodified[^>]*>(.*?)<\/d:getlastmodified>/);
                    
                    if (hrefMatch && hrefMatch[1]) {
                        const href = hrefMatch[1].trim();
                        
                        // Skip the root directory
                        if (href.endsWith('/webdav/') || href.endsWith('/webdav')) {
                            return;
                        }
                        
                        files.push({
                            href: href,
                            name: displayNameMatch ? displayNameMatch[1].trim() : href.split('/').pop(),
                            size: contentLengthMatch ? parseInt(contentLengthMatch[1]) : null,
                            lastModified: lastModifiedMatch ? new Date(lastModifiedMatch[1]) : null
                        });
                    }
                });
            }
        } catch (error) {
            console.error('[NextcloudApiClient] Error parsing WebDAV response', { error: error.message });
        }
        
        return files;
    }
    
    /**
     * Normalize axios errors
     */
    normalizeError(error) {
        if (error.response) {
            // Server responded with error status
            const normalizedError = new Error(error.response.data?.message || error.message);
            normalizedError.status = error.response.status;
            normalizedError.statusText = error.response.statusText;
            return normalizedError;
        } else if (error.request) {
            // Network error
            return new Error('Network error: Unable to connect to Nextcloud');
        } else {
            // Other error
            return error;
        }
    }
}

export default NextcloudApiClient;