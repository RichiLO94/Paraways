"""Escalado con inteligencia artificial (Real-ESRGAN) para las fotos y los cuadros de video de Le Petit Trianon.

Uso:
  python upscale.py ENTRADA SALIDA [--model x4plus|x2plus|general|general-wdn] [--denoise 0.5]
                    [--width 1920] [--tile 192] [--threads 4]
  ENTRADA y SALIDA pueden ser archivos de imagen o carpetas (procesa todas las .png/.jpg de la carpeta).

Requiere: PyTorch (CPU alcanza), numpy, opencv-python. Pesos oficiales de Real-ESRGAN (BSD-3-Clause):
  RealESRGAN_x4plus.pth, RealESRGAN_x2plus.pth  → https://github.com/xinntao/Real-ESRGAN/releases
  realesr-general-x4v3.pth, realesr-general-wdn-x4v3.pth (mismo repositorio, v0.2.5.0)
Variable de entorno PW_SR_MODELS: carpeta con los .pth (por defecto, ./models junto a este archivo).

Notas:
- x4plus: el mejor detalle para fotos fijas (lento en CPU; usa teselas).
- x2plus: mismo modelo a 2×, más rápido; recomendado para los cuadros de la película.
- general / general-wdn: modelo compacto y rápido; --denoise mezcla ambos (0 = sin reducción de ruido, 1 = máxima).
- --width reescala el resultado final con Lanczos (por ejemplo 1920 para fotos, 1280 para video).
"""
import argparse
import os
import sys
import time

import cv2
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F


class ResidualDenseBlock(nn.Module):
    def __init__(self, nf=64, gc=32):
        super().__init__()
        self.conv1 = nn.Conv2d(nf, gc, 3, 1, 1)
        self.conv2 = nn.Conv2d(nf + gc, gc, 3, 1, 1)
        self.conv3 = nn.Conv2d(nf + 2 * gc, gc, 3, 1, 1)
        self.conv4 = nn.Conv2d(nf + 3 * gc, gc, 3, 1, 1)
        self.conv5 = nn.Conv2d(nf + 4 * gc, nf, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, inplace=True)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, nf, gc=32):
        super().__init__()
        self.rdb1 = ResidualDenseBlock(nf, gc)
        self.rdb2 = ResidualDenseBlock(nf, gc)
        self.rdb3 = ResidualDenseBlock(nf, gc)

    def forward(self, x):
        return self.rdb3(self.rdb2(self.rdb1(x))) * 0.2 + x


class RRDBNet(nn.Module):
    def __init__(self, scale=4, nf=64, nb=23, gc=32):
        super().__init__()
        self.scale = scale
        in_ch = 3 * (4 if scale == 2 else 1)
        self.conv_first = nn.Conv2d(in_ch, nf, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(nf, gc) for _ in range(nb)])
        self.conv_body = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_hr = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_last = nn.Conv2d(nf, 3, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, inplace=True)

    def forward(self, x):
        feat = F.pixel_unshuffle(x, 2) if self.scale == 2 else x
        feat = self.conv_first(feat)
        feat = feat + self.conv_body(self.body(feat))
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode='nearest')))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode='nearest')))
        return self.conv_last(self.lrelu(self.conv_hr(feat)))


class SRVGGNetCompact(nn.Module):
    def __init__(self, nf=64, nc=32, upscale=4):
        super().__init__()
        self.upscale = upscale
        body = [nn.Conv2d(3, nf, 3, 1, 1), nn.PReLU(num_parameters=nf)]
        for _ in range(nc):
            body += [nn.Conv2d(nf, nf, 3, 1, 1), nn.PReLU(num_parameters=nf)]
        body += [nn.Conv2d(nf, 3 * upscale * upscale, 3, 1, 1)]
        self.body = nn.ModuleList(body)
        self.upsampler = nn.PixelShuffle(upscale)

    def forward(self, x):
        out = x
        for layer in self.body:
            out = layer(out)
        return self.upsampler(out) + F.interpolate(x, scale_factor=self.upscale, mode='nearest')


def _weights(path):
    sd = torch.load(path, map_location='cpu', weights_only=True)
    for k in ('params_ema', 'params'):
        if k in sd:
            return sd[k]
    return sd


def load_model(name, denoise, models_dir):
    if name in ('x4plus', 'x2plus'):
        scale = 4 if name == 'x4plus' else 2
        net = RRDBNet(scale=scale)
        net.load_state_dict(_weights(os.path.join(models_dir, f'RealESRGAN_{name}.pth')), strict=True)
        return net.eval(), scale
    net = SRVGGNetCompact()
    a = _weights(os.path.join(models_dir, 'realesr-general-x4v3.pth'))
    if name == 'general-wdn' or denoise > 0:
        b = _weights(os.path.join(models_dir, 'realesr-general-wdn-x4v3.pth'))
        w = 1.0 if name == 'general-wdn' else float(denoise)
        a = {k: (1 - w) * a[k] + w * b[k] for k in a}
    net.load_state_dict(a, strict=True)
    return net.eval(), 4


@torch.inference_mode()
def upscale(net, scale, img_bgr, tile=192, pad=12):
    img = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    x = torch.from_numpy(img).permute(2, 0, 1)[None]
    _, _, h, w = x.shape
    # el modelo x2 trabaja sobre la imagen «desplegada» a la mitad: los lados deben ser pares
    ph, pw = (h % 2, w % 2) if scale == 2 else (0, 0)
    if ph or pw:
        x = F.pad(x, (0, pw, 0, ph), mode='reflect')
        _, _, h2, w2 = x.shape
    else:
        h2, w2 = h, w
    out = torch.zeros(1, 3, h2 * scale, w2 * scale)
    for y0 in range(0, h2, tile):
        for x0 in range(0, w2, tile):
            y1, x1 = min(y0 + tile, h2), min(x0 + tile, w2)
            ya, xa = max(y0 - pad, 0), max(x0 - pad, 0)
            yb, xb = min(y1 + pad, h2), min(x1 + pad, w2)
            if scale == 2:  # bordes pares para pixel_unshuffle
                ya -= ya % 2; xa -= xa % 2; yb += yb % 2; xb += xb % 2
                yb, xb = min(yb, h2), min(xb, w2)
            o = net(x[:, :, ya:yb, xa:xb])
            oy, ox = (y0 - ya) * scale, (x0 - xa) * scale
            out[:, :, y0 * scale:y1 * scale, x0 * scale:x1 * scale] = o[:, :, oy:oy + (y1 - y0) * scale, ox:ox + (x1 - x0) * scale]
    out = out[:, :, :h * scale, :w * scale].clamp_(0, 1)[0].permute(1, 2, 0).numpy()
    return cv2.cvtColor((out * 255.0 + 0.5).astype(np.uint8), cv2.COLOR_RGB2BGR)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--model', default='x4plus', choices=['x4plus', 'x2plus', 'general', 'general-wdn'])
    ap.add_argument('--denoise', type=float, default=0.0)
    ap.add_argument('--width', type=int, default=0)
    ap.add_argument('--tile', type=int, default=192)
    ap.add_argument('--threads', type=int, default=max(1, (os.cpu_count() or 2)))
    a = ap.parse_args()
    torch.set_num_threads(a.threads)
    models_dir = os.environ.get('PW_SR_MODELS', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models'))
    net, scale = load_model(a.model, a.denoise, models_dir)
    if os.path.isdir(a.src):
        os.makedirs(a.dst, exist_ok=True)
        items = [(os.path.join(a.src, f), os.path.join(a.dst, os.path.splitext(f)[0] + '.png'))
                 for f in sorted(os.listdir(a.src)) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    else:
        items = [(a.src, a.dst)]
    for i, (s, d) in enumerate(items):
        t = time.time()
        im = cv2.imread(s, cv2.IMREAD_COLOR)
        up = upscale(net, scale, im, tile=a.tile)
        if a.width and up.shape[1] != a.width:
            h = round(up.shape[0] * a.width / up.shape[1])
            up = cv2.resize(up, (a.width, h), interpolation=cv2.INTER_LANCZOS4 if a.width > up.shape[1] else cv2.INTER_AREA)
        cv2.imwrite(d, up)
        print(f'[{i + 1}/{len(items)}] {os.path.basename(s)} → {up.shape[1]}×{up.shape[0]} en {time.time() - t:.1f} s', flush=True)


if __name__ == '__main__':
    sys.exit(main())
