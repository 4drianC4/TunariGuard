import { Injectable } from '@angular/core';
import * as L from 'leaflet';
import { MUNICIPAL_API_KEY, MUNICIPAL_WMS_PROXY } from './municipal-layers.config';

export interface MunicipalFeature {
  properties?: Record<string, unknown>;
  geometry?: unknown;
  id?: string | number;
}

export interface MunicipalFeatureInfo {
  features?: MunicipalFeature[];
  [key: string]: unknown;
}

@Injectable({ providedIn: 'root' })
export class MunicipalCartographyService {
  createLayer(serviceId: string): L.TileLayer.WMS {
    const options = {
      key: MUNICIPAL_API_KEY,
      service_id: serviceId,
      layers: '',
      service: 'WMS',
      request: 'GetMap',
      version: '1.1.1',
      format: 'image/png',
      transparent: true,
      maxZoom: 19,
      opacity: 1
    } as L.WMSOptions;
    return L.tileLayer.wms(MUNICIPAL_WMS_PROXY, options);
  }

  createLegendUrl(serviceId: string): string {
    const params = new URLSearchParams({
      key: MUNICIPAL_API_KEY,
      service_id: serviceId,
      LAYERS: '',
      SERVICE: 'WMS',
      REQUEST: 'GetLegendGraphic',
      VERSION: '1.0.0',
      FORMAT: 'image/png'
    });
    return `${MUNICIPAL_WMS_PROXY}?${params.toString()}`;
  }

  async getFeatureInfo(
    serviceId: string,
    bbox: string,
    width: number,
    height: number,
    x: number,
    y: number
  ): Promise<MunicipalFeatureInfo> {
    const params = new URLSearchParams({
      key: MUNICIPAL_API_KEY,
      service_id: serviceId,
      SERVICE: 'WMS',
      VERSION: '1.1.1',
      REQUEST: 'GetFeatureInfo',
      LAYERS: '',
      SRS: 'EPSG:3857',
      BBOX: bbox,
      WIDTH: String(width),
      HEIGHT: String(height),
      X: String(x),
      Y: String(y),
      INFO_FORMAT: 'application/json',
      FEATURE_COUNT: '5'
    });
    const response = await fetch(`${MUNICIPAL_WMS_PROXY}?${params.toString()}`);
    if (!response.ok) throw new Error(`GetFeatureInfo respondió HTTP ${response.status}.`);
    return await response.json() as MunicipalFeatureInfo;
  }
}