import React, { useState } from 'react';
import { CheckCircle2, XCircle, Loader2, Send, RefreshCw } from 'lucide-react';
import { testTelegramConnection, TelegramTestResult } from '../lib/telegram';

type StepState = 'pending' | 'ok' | 'fail';

const stepIcon = (state: StepState) => {
  if (state === 'ok') return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />;
  if (state === 'fail') return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
  return <Loader2 className="h-4 w-4 text-gray-400 animate-spin shrink-0" />;
};

export const TelegramTestPanel: React.FC = () => {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TelegramTestResult | null>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await testTelegramConnection();
      setResult(res);
    } catch (err) {
      setResult({
        ok: false,
        steps: [
          {
            label: 'Unexpected error',
            ok: false,
            detail: err instanceof Error ? err.message : String(err),
          },
        ],
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h3 className="text-lg font-serif font-bold text-brand-navy mb-1">Telegram Connection Test</h3>
        <p className="text-sm text-gray-500">
          Validates the Supabase Edge Function configuration: bot token, chat reachability,
          and bot membership. Check your Telegram group after running.
        </p>
      </div>

      {/* Config Summary */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600 space-y-1">
        <p>
          Messages are routed via the <strong>Supabase Edge Function</strong>{' '}
          (<code className="bg-gray-100 px-1 rounded text-xs">contact-form</code>).
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Configure <code className="bg-gray-100 px-1 rounded">TELEGRAM_BOT_TOKEN</code>,{' '}
          <code className="bg-gray-100 px-1 rounded">TELEGRAM_CHAT_IDS</code>, and optionally{' '}
          <code className="bg-gray-100 px-1 rounded">TELEGRAM_FALLBACK_CHAT_ID</code> in your
          Supabase project&apos;s edge function secrets.
        </p>
      </div>

      {/* Run Button */}
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="inline-flex items-center gap-2 bg-brand-navy text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-brand-gold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {running ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Running…</>
        ) : result ? (
          <><RefreshCw className="h-4 w-4" /> Run Again</>
        ) : (
          <><Send className="h-4 w-4" /> Run Test</>
        )}
      </button>

      {/* Results */}
      {result && (
        <div className="mt-6 rounded-lg border overflow-hidden">
          {/* Header */}
          <div
            className={`flex items-center gap-2 px-4 py-3 text-sm font-bold ${
              result.ok
                ? 'bg-green-50 border-b border-green-200 text-green-700'
                : 'bg-red-50 border-b border-red-200 text-red-700'
            }`}
          >
            {result.ok ? (
              <><CheckCircle2 className="h-4 w-4" /> All checks passed — message delivered!</>
            ) : (
              <><XCircle className="h-4 w-4" /> Test failed — see details below</>
            )}
          </div>

          {/* Steps */}
          <ul className="divide-y divide-gray-100 bg-white">
            {result.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3 px-4 py-3">
                {stepIcon(step.ok ? 'ok' : 'fail')}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-700">{step.label}</p>
                  <p className="mt-0.5 text-xs text-gray-500 break-all">{step.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
