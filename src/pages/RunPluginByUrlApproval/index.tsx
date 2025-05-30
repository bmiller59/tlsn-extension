import React, { ReactElement, useCallback, useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import { useSearchParams } from 'react-router-dom';
import { type PluginConfig, PluginMetadata, urlify } from '../../utils/misc';
import browser from 'webextension-polyfill';
import { BackgroundActiontype } from '../../entries/Background/rpc';
import { BaseApproval } from '../BaseApproval';
import { PluginPermissions } from '../../components/PluginInfo';
import {
  getPluginConfigByUrl,
  getPluginMetadataByUrl,
  getPluginByUrl,
} from '../../entries/Background/db';
import { SidePanelActionTypes } from '../../entries/SidePanel/types';
import { deferredPromise } from '../../utils/promise';
import { installPlugin } from '../../entries/Background/plugins/utils';

export function RunPluginByUrlApproval(): ReactElement {
  const [params] = useSearchParams();
  const origin = params.get('origin');
  const favIconUrl = params.get('favIconUrl');
  const url = params.get('url');
  const pluginParams = params.get('params');
  const hostname = urlify(origin || '')?.hostname;
  const [error, showError] = useState('');
  const [metadata, setPluginMetadata] = useState<PluginMetadata | null>(null);
  const [pluginContent, setPluginContent] = useState<PluginConfig | null>(null);

  useEffect(() => {
    if (!url) return;
    (async () => {
      try {
        const hex = await getPluginByUrl(url);

        if (!hex) {
          await installPlugin(url);
        }

        const config = await getPluginConfigByUrl(url);
        const metadata = await getPluginMetadataByUrl(url);
        setPluginContent(config);
        setPluginMetadata(metadata);
      } catch (e: any) {
        showError(e?.message || 'Invalid Plugin');
      }
    })();
  }, [url]);

  const onCancel = useCallback(() => {
    browser.runtime.sendMessage({
      type: BackgroundActiontype.run_plugin_by_url_response,
      data: false,
    });
  }, []);

  const onAccept = useCallback(async () => {
    if (!url) return;
    try {
      const tab = await browser.tabs.create({
        active: true,
      });

      const { promise, resolve } = deferredPromise();

      const listener = async (request: any) => {
        if (request.type === SidePanelActionTypes.panel_opened) {
          browser.runtime.onMessage.removeListener(listener);
          resolve();
        }
      };

      browser.runtime.onMessage.addListener(listener);

      // @ts-ignore
      if (chrome.sidePanel) await chrome.sidePanel.open({ tabId: tab.id });

      await promise;

      browser.runtime.sendMessage({
        type: SidePanelActionTypes.execute_plugin_request,
        data: {
          pluginUrl: url,
          pluginParams: pluginParams ? JSON.parse(pluginParams) : undefined,
        },
      });

      browser.runtime.sendMessage({
        type: BackgroundActiontype.run_plugin_by_url_response,
        data: true,
      });
    } catch (e: any) {
      showError(e.message);
    }
  }, [url]);

  return (
    <BaseApproval
      header={`Execute Plugin`}
      onSecondaryClick={onCancel}
      onPrimaryClick={onAccept}
    >
      <div className="flex flex-col items-center gap-2 py-8">
        {!!favIconUrl ? (
          <img
            src={favIconUrl}
            className="h-16 w-16 rounded-full border border-slate-200 bg-slate-200"
            alt="logo"
          />
        ) : (
          <Icon
            fa="fa-solid fa-globe"
            size={4}
            className="h-16 w-16 rounded-full border border-slate-200 text-blue-500"
          />
        )}
        <div className="text-2xl text-center px-8">
          <b className="text-blue-500">{hostname}</b> wants to execute a plugin:
        </div>
      </div>
      {!pluginContent && (
        <div className="flex flex-col items-center flex-grow gap-4 border border-slate-300 p-8 mx-8 rounded bg-slate-100">
          <Icon
            className="animate-spin w-fit text-slate-500"
            fa="fa-solid fa-spinner"
            size={1}
          />
        </div>
      )}
      {pluginContent && (
        <div className="flex flex-col gap-4 border border-slate-300 p-4 mx-8 rounded bg-slate-100">
          <div className="flex flex-col items-center">
            <img
              className="w-12 h-12 mb-2"
              src={pluginContent.icon}
              alt="Plugin Icon"
            />
            <span className="text-2xl text-blue-600 font-semibold">
              {pluginContent.title}
            </span>
            <div className="text-slate-500 text-base">
              {pluginContent.description}
            </div>
          </div>
        </div>
      )}
    </BaseApproval>
  );
}
