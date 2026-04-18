import React, { useState } from 'react';
import { Mail, Phone, MapPin, Send, Clock } from 'lucide-react';
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
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await sendTelegramMessage({
        name: formData.fullName.trim(),
        email: formData.email.trim(),
        subject: formData.subject.trim(),
        message: formData.message.trim()
      });
      setSuccess(true);
      setFormData({ fullName: '', email: '', subject: '', message: '' });
      setTimeout(() => setSuccess(false), 5000);
    } catch (err: unknown) {
      console.error('Error sending message:', err);
      const message = err instanceof Error ? err.message : 'Failed to send message. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageTransition>
      <SEO title="Contact Us" description="Get in touch with our legal team." />
      <section className="pt-28 md:pt-32 bg-brand-navy text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_25%_25%,rgba(255,255,255,0.14),transparent_40%)]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-28 text-center relative z-10">
          <h1 className="text-6xl md:text-7xl font-serif font-bold">{t('contact')}</h1>
          <div className="w-36 h-1 bg-brand-gold mx-auto my-8"></div>
          <p className="text-2xl md:text-3xl text-white/90 font-light">{t('contactSubtitle')}</p>
        </div>
      </section>
      <div className="py-20 bg-brand-gray dark:bg-brand-dark min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 shadow-xl overflow-hidden">
            <div className="lg:col-span-5 bg-brand-navy text-white p-10 md:p-12">
              <h2 className="text-4xl font-serif font-bold mb-6">{t('getInTouchTitle')}</h2>
              <p className="text-white/85 text-xl leading-relaxed mb-12">
                {t('consultationAvail')}
              </p>

              <div className="space-y-10">
                <div className="flex items-start gap-5">
                  <MapPin className="w-7 h-7 text-brand-gold mt-1 shrink-0" />
                  <div>
                    <h3 className="font-serif text-2xl font-bold mb-2">{t('ourOffice')}</h3>
                    <p className="text-white/80 leading-relaxed">{address}</p>
                  </div>
                </div>

                <div className="flex items-start gap-5">
                  <Clock className="w-7 h-7 text-brand-gold mt-1 shrink-0" />
                  <div>
                    <h3 className="font-serif text-2xl font-bold mb-2">{t('businessHours')}</h3>
                    <p className="text-white/80">{businessHours}</p>
                  </div>
                </div>

                <div className="flex items-start gap-5">
                  <Phone className="w-7 h-7 text-brand-gold mt-1 shrink-0" />
                  <div>
                    <h3 className="font-serif text-2xl font-bold mb-2">{t('phone')}</h3>
                    <div className="space-y-2">
                      {CONTACT_INFO.phones.map((phone) => (
                        <p key={phone.number} className="text-white/80">
                          {phone.number}
                          <span className="text-white/65 ml-2">({phone.label})</span>
                        </p>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-5">
                  <Mail className="w-7 h-7 text-brand-gold mt-1 shrink-0" />
                  <div>
                    <h3 className="font-serif text-2xl font-bold mb-2">{t('email')}</h3>
                    <a href={`mailto:${CONTACT_INFO.email}`} className="text-white/80 hover:text-white transition-colors">
                      {CONTACT_INFO.email}
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 bg-[#ececec] dark:bg-gray-800 p-10 md:p-12">
              <h2 className="text-5xl font-serif font-bold mb-10 text-brand-navy dark:text-white">{t('sendMessage')}</h2>

              {success && (
                <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-md border border-green-200">
                  Message sent successfully! We will contact you soon.
                </div>
              )}

              {error && (
                <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-md">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold tracking-widest uppercase text-gray-600 dark:text-gray-300 mb-2">{t('fullName')}</label>
                    <input type="text" name="fullName" required value={formData.fullName} onChange={handleChange} className="w-full px-5 py-4 border border-gray-300 bg-[#f3f3f3] text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-brand-navy focus:border-brand-navy" placeholder="John Doe" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold tracking-widest uppercase text-gray-600 dark:text-gray-300 mb-2">{t('emailAddress')}</label>
                    <input type="email" name="email" required value={formData.email} onChange={handleChange} className="w-full px-5 py-4 border border-gray-300 bg-[#f3f3f3] text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-brand-navy focus:border-brand-navy" placeholder="email@example.com" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold tracking-widest uppercase text-gray-600 dark:text-gray-300 mb-2">{t('subject')}</label>
                  <input type="text" name="subject" required value={formData.subject} onChange={handleChange} className="w-full px-5 py-4 border border-gray-300 bg-[#f3f3f3] text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-brand-navy focus:border-brand-navy" placeholder="Legal Inquiry..." />
                </div>
                <div>
                  <label className="block text-sm font-bold tracking-widest uppercase text-gray-600 dark:text-gray-300 mb-2">{t('message')}</label>
                  <textarea name="message" required rows={7} value={formData.message} onChange={handleChange} className="w-full px-5 py-4 border border-gray-300 bg-[#f3f3f3] text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-brand-navy focus:border-brand-navy" placeholder="How can we help you?" />
                </div>
                <button type="submit" disabled={loading} className="inline-flex items-center justify-center bg-brand-gold hover:bg-brand-goldLight text-white font-bold py-4 px-10 tracking-wider uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
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
