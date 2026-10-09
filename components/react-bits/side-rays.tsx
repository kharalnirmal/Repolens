"use client";

import { useEffect, useRef } from "react";
import { Mesh, Program, Renderer, Triangle } from "ogl";

import "./side-rays.css";

type RayOrigin = "top-right" | "top-left" | "bottom-right" | "bottom-left";

interface SideRaysProps {
  speed?: number;
  rayColor1?: string;
  rayColor2?: string;
  intensity?: number;
  spread?: number;
  origin?: RayOrigin;
  tilt?: number;
  saturation?: number;
  blend?: number;
  falloff?: number;
  opacity?: number;
  className?: string;
}

interface Uniform<T> {
  value: T;
}

interface RayUniforms {
  iTime: Uniform<number>;
  iResolution: Uniform<[number, number]>;
  iSpeed: Uniform<number>;
  iRayColor1: Uniform<[number, number, number]>;
  iRayColor2: Uniform<[number, number, number]>;
  iIntensity: Uniform<number>;
  iSpread: Uniform<number>;
  iFlipX: Uniform<number>;
  iFlipY: Uniform<number>;
  iTilt: Uniform<number>;
  iSaturation: Uniform<number>;
  iBlend: Uniform<number>;
  iFalloff: Uniform<number>;
  iOpacity: Uniform<number>;
}

const vertexShader = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const fragmentShader = `
precision highp float;

uniform float iTime;
uniform vec2 iResolution;
uniform float iSpeed;
uniform vec3 iRayColor1;
uniform vec3 iRayColor2;
uniform float iIntensity;
uniform float iSpread;
uniform float iFlipX;
uniform float iFlipY;
uniform float iTilt;
uniform float iSaturation;
uniform float iBlend;
uniform float iFalloff;
uniform float iOpacity;

float rayStrength(vec2 raySource, vec2 rayRefDirection, vec2 coord, float seedA, float seedB, float speed) {
  vec2 sourceToCoord = coord - raySource;
  float cosAngle = dot(normalize(sourceToCoord), rayRefDirection);
  return clamp(
    (0.45 + 0.15 * sin(cosAngle * seedA + iTime * speed)) +
    (0.3 + 0.2 * cos(-cosAngle * seedB + iTime * speed)),
    0.0, 1.0
  ) * clamp((iResolution.x - length(sourceToCoord)) / iResolution.x, 0.5, 1.0);
}

void main() {
  vec2 fragCoord = gl_FragCoord.xy;
  if (iFlipX > 0.5) fragCoord.x = iResolution.x - fragCoord.x;
  if (iFlipY > 0.5) fragCoord.y = iResolution.y - fragCoord.y;

  vec2 coord = vec2(fragCoord.x, iResolution.y - fragCoord.y);
  vec2 rayPos = vec2(iResolution.x * 1.1, -0.5 * iResolution.y);
  float tiltRad = iTilt * 3.14159265 / 180.0;
  float cs = cos(tiltRad);
  float sn = sin(tiltRad);
  vec2 rel = coord - rayPos;
  vec2 tiltedCoord = vec2(rel.x * cs - rel.y * sn, rel.x * sn + rel.y * cs) + rayPos;

  float halfSpread = iSpread * 0.275;
  vec2 rayRefDir1 = normalize(vec2(cos(0.785398 + halfSpread), sin(0.785398 + halfSpread)));
  vec2 rayRefDir2 = normalize(vec2(cos(0.785398 - halfSpread), sin(0.785398 - halfSpread)));
  vec4 rays1 = vec4(iRayColor1, 1.0) * rayStrength(rayPos, rayRefDir1, tiltedCoord, 36.2214, 21.11349, iSpeed);
  vec4 rays2 = vec4(iRayColor2, 1.0) * rayStrength(rayPos, rayRefDir2, tiltedCoord, 22.3991, 18.0234, iSpeed * 0.2);
  vec4 color = rays1 * (1.0 - iBlend) * 0.9 + rays2 * iBlend * 0.9;

  float distanceToLight = length(fragCoord.xy - vec2(rayPos.x, iResolution.y - rayPos.y)) / iResolution.y;
  float brightness = iIntensity * 0.4 / pow(max(distanceToLight, 0.001), iFalloff);
  color.rgb *= brightness;
  float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  color.rgb = mix(vec3(gray), color.rgb, iSaturation);
  color.a = max(color.r, max(color.g, color.b)) * iOpacity;
  gl_FragColor = color;
}`;

function resolveColor(color: string): [number, number, number] {
  const variable = /^var\((--[^)]+)\)$/.exec(color)?.[1];
  const resolved = variable
    ? getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
    : color;
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(resolved);

  return match
    ? [parseInt(match[1], 16) / 255, parseInt(match[2], 16) / 255, parseInt(match[3], 16) / 255]
    : [1, 1, 1];
}

function originToFlip(origin: RayOrigin): [number, number] {
  switch (origin) {
    case "top-left": return [1, 0];
    case "bottom-right": return [0, 1];
    case "bottom-left": return [1, 1];
    default: return [0, 0];
  }
}

export default function SideRays({
  speed = 2.5,
  rayColor1 = "var(--imports)",
  rayColor2 = "var(--imported-by)",
  intensity = 2,
  spread = 2,
  origin = "top-right",
  tilt = 0,
  saturation = 1.5,
  blend = 0.75,
  falloff = 1.6,
  opacity = 1,
  className = "",
}: SideRaysProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new Renderer({
      dpr: Math.min(window.devicePixelRatio, 2),
      alpha: true,
    });
    const gl = renderer.gl;
    container.replaceChildren(gl.canvas);

    const [flipX, flipY] = originToFlip(origin);
    const uniforms: RayUniforms = {
      iTime: { value: 0 },
      iResolution: { value: [1, 1] },
      iSpeed: { value: speed },
      iRayColor1: { value: resolveColor(rayColor1) },
      iRayColor2: { value: resolveColor(rayColor2) },
      iIntensity: { value: intensity },
      iSpread: { value: spread },
      iFlipX: { value: flipX },
      iFlipY: { value: flipY },
      iTilt: { value: tilt },
      iSaturation: { value: saturation },
      iBlend: { value: blend },
      iFalloff: { value: falloff },
      iOpacity: { value: opacity },
    };
    const geometry = new Triangle(gl);
    const program = new Program(gl, { vertex: vertexShader, fragment: fragmentShader, uniforms });
    const mesh = new Mesh(gl, { geometry, program });
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrame: number | null = null;
    let visible = true;

    const render = (time = 0) => {
      uniforms.iTime.value = reducedMotion.matches ? 0 : time * 0.001;
      renderer.render({ scene: mesh });
      if (visible && !reducedMotion.matches && speed !== 0) animationFrame = requestAnimationFrame(render);
    };
    const updateSize = () => {
      renderer.setSize(container.clientWidth, container.clientHeight);
      uniforms.iResolution.value = [gl.canvas.width, gl.canvas.height];
      if (reducedMotion.matches) render();
    };
    const updateColors = () => {
      uniforms.iRayColor1.value = resolveColor(rayColor1);
      uniforms.iRayColor2.value = resolveColor(rayColor2);
      renderer.render({ scene: mesh });
    };
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && animationFrame === null && speed !== 0) animationFrame = requestAnimationFrame(render);
      if (!visible && animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
    }, { threshold: 0.1 });
    const resizeObserver = new ResizeObserver(updateSize);
    const themeObserver = new MutationObserver(updateColors);

    resizeObserver.observe(container);
    visibilityObserver.observe(container);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    updateSize();
    render();

    return () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      themeObserver.disconnect();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      gl.canvas.remove();
    };
  }, [blend, falloff, intensity, opacity, origin, rayColor1, rayColor2, saturation, speed, spread, tilt]);

  return <div ref={containerRef} aria-hidden="true" className={`side-rays-container ${className}`.trim()} />;
}
