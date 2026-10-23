/* Paraways · Le Petit Trianon — postproceso (módulo ES). Expone los pases de three.js r158 al núcleo clásico (app.js) en window.PW_POST. */
import { EffectComposer } from './addons/postprocessing/EffectComposer.js';
import { RenderPass } from './addons/postprocessing/RenderPass.js';
import { ShaderPass } from './addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from './addons/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from './addons/postprocessing/SSAOPass.js';
import { BokehPass } from './addons/postprocessing/BokehPass.js';
import { OutputPass } from './addons/postprocessing/OutputPass.js';
import { SMAAPass } from './addons/postprocessing/SMAAPass.js';
window.PW_POST = { EffectComposer, RenderPass, ShaderPass, UnrealBloomPass, SSAOPass, BokehPass, OutputPass, SMAAPass };
document.dispatchEvent(new Event('pw-post-ready'));
