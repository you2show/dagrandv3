import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageSquare, X, Phone } from 'lucide-react';
import { CONTACT_INFO } from '../constants';

export default function FloatingContact() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [isOpen]);

  const socials = [
    {
      name: 'Telegram',
      href: telegramUrl,
      color: '#229ED9',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 11.944 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
      ),
      openInNewTab: true
    },
    {
      name: 'WhatsApp',
      href: whatsappUrl,
      color: '#25D366',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
        </svg>
      ),
      openInNewTab: true
    },
    {
      name: rawPhone,
      href: `tel:${intlPhone}`,
      color: '#153c63',
      icon: <Phone className="h-5 w-5" />,
      openInNewTab: false
    }
  ];

  return (
    <div ref={containerRef} className="fixed bottom-5 right-5 md:bottom-6 md:right-6 z-[60] flex flex-col items-end gap-3">
      <AnimatePresence>
        {isOpen && (
          <div className="mb-1 flex flex-col items-end gap-2.5">
            {socials.map((social, index) => (
              <motion.a
                key={social.name}
                href={social.href}
                target={social.openInNewTab ? '_blank' : undefined}
                rel={social.openInNewTab ? 'noopener noreferrer' : undefined}
                initial={{ opacity: 0, y: 22, scale: 0.88 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.88 }}
                transition={{ duration: 0.2, delay: index * 0.06 }}
                className="group flex items-center gap-2"
              >
                <span className="hidden whitespace-nowrap rounded-md border border-gray-100 bg-white/95 px-2.5 py-1 text-xs font-semibold text-brand-navy shadow-md dark:border-white/10 dark:bg-brand-dark/95 dark:text-gray-100 md:block">
                  {social.name === rawPhone ? 'Call Us' : social.name}
                </span>
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-full text-white shadow-lg transition-transform duration-200 group-hover:scale-105"
                  style={{ backgroundColor: social.color }}
                >
                  {social.icon}
                </span>
              </motion.a>
            ))}
          </div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => setIsOpen((prev) => !prev)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={`relative flex h-14 w-14 items-center justify-center rounded-full shadow-[0_0_20px_rgba(180,155,103,0.35)] transition-colors duration-300 ${
          isOpen ? 'bg-brand-gray text-brand-navy dark:bg-gray-100' : 'bg-brand-gold text-white'
        }`}
        aria-label={isOpen ? 'Close contact options' : 'Open contact options'}
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.span
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <X className="h-6 w-6" />
            </motion.span>
          ) : (
            <motion.span
              key="chat"
              initial={{ scale: 0.75, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.75, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <MessageSquare className="h-6 w-6" />
            </motion.span>
          )}
        </AnimatePresence>

        {!isOpen && <span className="absolute right-0.5 top-0.5 h-4 w-4 rounded-full border-2 border-white bg-red-500" />}
      </motion.button>
    </div>
  );
}
