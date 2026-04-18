import React, { useMemo, useState } from 'react';
import { MessageCircle, X, Send, Phone } from 'lucide-react';
import { CONTACT_INFO } from '../../constants';

export default function FloatingContact() {
  const [isOpen, setIsOpen] = useState(false);

  const { rawPhone, intlPhone, whatsappUrl, telegramUrl } = useMemo(() => {
    const fallbackPhone = '+855 (0)98 539 910';
    const basePhone = CONTACT_INFO.phones?.[0]?.number || fallbackPhone;
    const digitsOnly = basePhone.replace(/\D/g, '');
    const normalizedIntl = digitsOnly.startsWith('0') ? `855${digitsOnly.slice(1)}` : digitsOnly;
    return {
      rawPhone: basePhone,
      intlPhone: normalizedIntl,
      whatsappUrl: `https://wa.me/${normalizedIntl}`,
      telegramUrl: `https://t.me/+${normalizedIntl}`
    };
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen && (
        <div className="absolute bottom-16 right-0 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden mb-4">
          <div className="bg-brand-navy text-white p-4 flex justify-between items-center">
            <h3 className="font-semibold text-sm tracking-wide">Contact Options</h3>
            <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-3 space-y-2">
            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Send className="w-4 h-4 text-[#229ED9]" />
              Telegram
            </a>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <MessageCircle className="w-4 h-4 text-[#25D366]" />
              WhatsApp
            </a>
            <a
              href={`tel:${intlPhone}`}
              className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Phone className="w-4 h-4 text-brand-gold" />
              {rawPhone}
            </a>
          </div>
        </div>
      )}
      <button onClick={() => setIsOpen(!isOpen)} className="bg-brand-gold hover:bg-brand-goldLight text-white rounded-full p-4 shadow-lg transition-transform hover:scale-105">
        {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>
    </div>
  );
}
