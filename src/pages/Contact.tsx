import React, { useState } from 'react';
import { Mail, Phone, MapPin, Send, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { SEO } from '../components/SEO';
import { PageTransition } from '../components/PageTransition';
import { sendTelegramMessage } from '../lib/telegram';
import { CONTACT_INFO } from '../constants';
import { useLanguage } from '../contexts/LanguageContext';

export default function Contact() {
  const { t, getContent } = useLanguage();
  const address = getContent(CONTACT_INFO.address, CONTACT_INFO.address_cn);
  const businessHours = getContent(CONTACT_INFO.businessHours, CONTACT_INFO.businessHours_cn);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    subject: '',
    message: ''
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    try {
      await sendTelegramMessage({
        name: formData.fullName.trim(),
        email: formData.email.trim(),
        subject: formData.subject.trim(),
        message: formData.message.trim()
      });
      toast.custom(
        () => (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            role="status"
            aria-live="polite"
            className="w-full max-w-md rounded-md border border-brand-gold/70 bg-brand-navy px-4 py-3 shadow-xl"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-brand-gold" />
              <div>
                <p className="font-serif text-base font-bold tracking-wide text-white">Message sent successfully</p>
                <p className="mt-1 text-sm text-white/80">Thank you. Our legal team will contact you shortly.</p>
              </div>
            </div>
          </motion.div>
        ),
        { duration: 4200 }
      );
      setFormData({ fullName: '', email: '', subject: '', message: '' });
    } catch (err: unknown) {
      console.error('Error sending message:', err);
      const message = err instanceof Error ? err.message : 'Failed to send message. Please try again.';
      toast.custom(
        () => (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            role="alert"
            aria-live="assertive"
            className="w-full max-w-md rounded-md border border-red-300 bg-white px-4 py-3 shadow-xl"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
              <div>
                <p className="font-serif text-base font-bold tracking-wide text-brand-navy">Failed to send message</p>
                <p className="mt-1 text-sm text-gray-700">{message}</p>
              </div>
            </div>
          </motion.div>
        ),
        { duration: 5000 }
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageTransition>
      <SEO title="Contact Us" description="Get in touch with our legal team." />
      <section className="bg-brand-navy text-white relative overflow-hidden pt-32 pb-20 md:pt-40 md:pb-28">
        <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_25%_25%,rgba(255,255,255,0.14),transparent_40%)]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold tracking-wide mb-6">{t('contact')}</h1>
          <div className="w-20 h-1 bg-brand-gold mx-auto mb-8"></div>
          <p className="text-lg md:text-xl text-gray-200 max-w-2xl mx-auto font-light leading-relaxed">{t('contactSubtitle')}</p>
        </div>
      </section>
      <div className="py-16 md:py-20 bg-brand-gray dark:bg-brand-dark min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 shadow-xl overflow-hidden rounded-sm">
            <div className="lg:col-span-5 bg-brand-navy text-white p-8 md:p-10">
              <h2 className="text-3xl md:text-4xl font-serif font-bold mb-5">{t('getInTouchTitle')}</h2>
              <p className="text-white/85 text-lg leading-relaxed mb-10">
                {t('consultationAvail')}
              </p>

              <div className="space-y-8">
                <div className="flex items-start gap-4">
                  <MapPin className="w-7 h-7 text-brand-gold mt-1 shrink-0" />
                  <div>
                    <h3 className="font-serif text-xl font-bold mb-1.5">{t('ourOffice')}</h3>
                    <p className="text-white/80 leading-relaxed text-sm md:text-base">{address}</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <Clock className="w-7 h-7 text-brand-gold mt-1 shrink-0" />
                  <div>
                    <h3 className="font-serif text-xl font-bold mb-1.5">{t('businessHours')}</h3>
                    <p className="text-white/80 text-sm md:text-base">{businessHours}</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <Phone className="w-7 h-7 text-brand-gold mt-1 shrink-0" />
                  <div>
                    <h3 className="font-serif text-xl font-bold mb-1.5">{t('phone')}</h3>
                    <div className="space-y-1.5">
                      {CONTACT_INFO.phones.map((phone) => (
                        <p key={phone.number} className="text-white/80 text-sm md:text-base">
                          {phone.number}
                          <span className="text-white/65 ml-1.5">({phone.label})</span>
                        </p>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <Mail className="w-7 h-7 text-brand-gold mt-1 shrink-0" />
                  <div>
                    <h3 className="font-serif text-xl font-bold mb-1.5">{t('email')}</h3>
                    <a href={`mailto:${CONTACT_INFO.email}`} className="text-white/80 hover:text-white transition-colors text-sm md:text-base">
                      {CONTACT_INFO.email}
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 bg-[#ececec] dark:bg-gray-800 p-8 md:p-10">
              <h2 className="text-4xl md:text-5xl font-serif font-bold mb-8 text-brand-navy dark:text-white">{t('sendMessage')}</h2>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold tracking-[0.18em] uppercase text-gray-600 dark:text-gray-300 mb-2">{t('fullName')}</label>
                    <input type="text" name="fullName" required value={formData.fullName} onChange={handleChange} className="w-full px-4 py-3.5 border border-gray-300 bg-[#f3f3f3] text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-brand-navy focus:border-brand-navy" placeholder="John Doe" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold tracking-[0.18em] uppercase text-gray-600 dark:text-gray-300 mb-2">{t('emailAddress')}</label>
                    <input type="email" name="email" required value={formData.email} onChange={handleChange} className="w-full px-4 py-3.5 border border-gray-300 bg-[#f3f3f3] text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-brand-navy focus:border-brand-navy" placeholder="email@example.com" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold tracking-[0.18em] uppercase text-gray-600 dark:text-gray-300 mb-2">{t('subject')}</label>
                  <input type="text" name="subject" required value={formData.subject} onChange={handleChange} className="w-full px-4 py-3.5 border border-gray-300 bg-[#f3f3f3] text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-brand-navy focus:border-brand-navy" placeholder="Legal Inquiry..." />
                </div>
                <div>
                  <label className="block text-xs font-bold tracking-[0.18em] uppercase text-gray-600 dark:text-gray-300 mb-2">{t('message')}</label>
                  <textarea name="message" required rows={6} value={formData.message} onChange={handleChange} className="w-full px-4 py-3.5 border border-gray-300 bg-[#f3f3f3] text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-brand-navy focus:border-brand-navy" placeholder="How can we help you?" />
                </div>
                <button type="submit" disabled={loading} className="inline-flex items-center justify-center bg-brand-gold hover:bg-brand-goldLight text-white text-sm font-bold py-3.5 px-8 tracking-[0.18em] uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {loading ? 'Sending...' : <><Send className="w-5 h-5 mr-3" /> {t('sendBtn')}</>}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
