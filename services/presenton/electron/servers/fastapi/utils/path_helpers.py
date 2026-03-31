"""
Path resolution utilities for handling different deployment environments.

Supports:
- Development: Normal relative paths
- Docker: Standard file system paths
- PyInstaller (Electron): Paths resolved via sys._MEIPASS
"""

import os
import sys
import tempfile


def get_resource_path(relative_path: str) -> str:
    """
    Get absolute path to a read-only resource (bundled assets).
    
    Works across different environments:
    - Development: Uses current working directory
    - Docker: Uses current working directory
    - PyInstaller: Uses temporary extraction directory (sys._MEIPASS)
    
    Args:
        relative_path: Path relative to the application root
        
    Returns:
        Absolute path to the resource
        
    Example:
        >>> get_resource_path("static/icons/icon.svg")
        '/path/to/static/icons/icon.svg'
    """
    try:
        # PyInstaller creates a temp folder and stores path in _MEIPASS
        base_path = sys._MEIPASS
        # Running in PyInstaller bundle
        return os.path.join(base_path, relative_path)
    except AttributeError:
        # Running in normal Python (development or Docker)
        base_path = os.path.abspath(".")
        return os.path.join(base_path, relative_path)


def get_writable_path(relative_path: str) -> str:
    """
    Get absolute path to a writable location (for cache, user data, etc.).
    
    Works across different environments:
    - Development: Uses current working directory
    - Docker: Uses current working directory (volumes should be mounted)
    - PyInstaller: Uses executable directory or falls back to temp directory
    
    Args:
        relative_path: Path relative to the writable base location
        
    Returns:
        Absolute path to a writable location
        
    Example:
        >>> get_writable_path("fastembed_cache")
        '/writable/path/fastembed_cache'
    """
    try:
        # Check if running in PyInstaller bundle
        base_path = sys._MEIPASS
        
        # In packaged mode, try to use a writable location
        # First try: directory where the executable is located
        exe_dir = os.path.dirname(sys.executable)
        writable_path = os.path.join(exe_dir, relative_path)
        
        # Test if writable
        try:
            os.makedirs(writable_path, exist_ok=True)
            # Try to create a test file to verify write access
            test_file = os.path.join(writable_path, '.write_test')
            try:
                with open(test_file, 'w') as f:
                    f.write('test')
                os.remove(test_file)
                return writable_path
            except (IOError, OSError):
                pass
        except (IOError, OSError):
            pass
        
        # Fallback: Use temp directory with app-specific subdirectory
        temp_base = os.path.join(tempfile.gettempdir(), "presenton")
        writable_path = os.path.join(temp_base, relative_path)
        os.makedirs(writable_path, exist_ok=True)
        return writable_path
        
    except AttributeError:
        # Running in normal Python (development or Docker)
        # Use current directory - in Docker, volumes should be mounted
        base_path = os.path.abspath(".")
        writable_path = os.path.join(base_path, relative_path)
        os.makedirs(writable_path, exist_ok=True)
        return writable_path


def is_pyinstaller() -> bool:
    """
    Check if the application is running in a PyInstaller bundle.
    
    Returns:
        True if running in PyInstaller, False otherwise
    """
    return hasattr(sys, '_MEIPASS')


def is_docker() -> bool:
    """
    Check if the application is running in a Docker container.
    
    Returns:
        True if running in Docker, False otherwise
    """
    # Check for common Docker indicators
    if os.path.exists('/.dockerenv'):
        return True
    
    # Check cgroup for docker
    try:
        with open('/proc/1/cgroup', 'rt') as f:
            return 'docker' in f.read()
    except Exception:
        return False


def get_environment_type() -> str:
    """
    Determine the current runtime environment.
    
    Returns:
        'pyinstaller', 'docker', or 'development'
    """
    if is_pyinstaller():
        return 'pyinstaller'
    elif is_docker():
        return 'docker'
    else:
        return 'development'


def patch_python_docx_templates():
    """
    Patch python-docx template path resolution for PyInstaller bundles.
    
    In PyInstaller bundles, python-docx cannot find template files using relative
    paths from __file__. This function patches the template loading functions to
    use sys._MEIPASS to locate templates in the bundle.
    
    This function is safe to call in any environment:
    - Docker/Development: Returns immediately without patching (no-op)
    - PyInstaller: Patches the template loading functions
    
    Note: This should be called before using docling service in PyInstaller bundles.
    """
    # Only patch if running in PyInstaller bundle
    # This check ensures Docker and development environments are unaffected
    if not is_pyinstaller():
        return
    
    try:
        # Import docx.parts.hdrftr - this will only succeed if python-docx is installed
        # On Windows, python-docx might not be installed, so we catch ImportError
        from docx.parts import hdrftr as hdrftr_module
        
        # Patch _default_header_xml
        if hasattr(hdrftr_module, '_default_header_xml'):
            _original_default_header_xml = hdrftr_module._default_header_xml
            
            def _patched_default_header_xml():
                """Patched function that resolves template path correctly in PyInstaller bundle."""
                try:
                    template_path = os.path.join(sys._MEIPASS, 'docx', 'templates', 'default-header.xml')
                    if os.path.exists(template_path):
                        with open(template_path, 'rb') as f:
                            return f.read()
                except Exception:
                    # If anything fails, fall back to original implementation
                    pass
                # Fallback to original implementation
                return _original_default_header_xml()
            
            hdrftr_module._default_header_xml = _patched_default_header_xml
        
        # Patch _default_footer_xml
        if hasattr(hdrftr_module, '_default_footer_xml'):
            _original_default_footer_xml = hdrftr_module._default_footer_xml
            
            def _patched_default_footer_xml():
                """Patched function that resolves template path correctly in PyInstaller bundle."""
                try:
                    template_path = os.path.join(sys._MEIPASS, 'docx', 'templates', 'default-footer.xml')
                    if os.path.exists(template_path):
                        with open(template_path, 'rb') as f:
                            return f.read()
                except Exception:
                    # If anything fails, fall back to original implementation
                    pass
                return _original_default_footer_xml()
            
            hdrftr_module._default_footer_xml = _patched_default_footer_xml
    except ImportError:
        # python-docx is not installed (e.g., on Windows)
        # This is expected and safe to ignore
        pass
    except Exception:
        # Any other error - log it but don't crash
        # The original code might still work without the patch
        pass
