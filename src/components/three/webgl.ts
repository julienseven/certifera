/**
 * Reports the GPU behind a WebGL context, or null when there is no context at all.
 * Shared by every artwork wrapper: the answer decides whether a three.js chunk is
 * worth downloading, and the debug overlays print it verbatim.
 */
export function webglReport() {
  try {
    const probe = document.createElement("canvas");
    const gl = (probe.getContext("webgl2") || probe.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return null;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "available";
  } catch {
    return null;
  }
}
