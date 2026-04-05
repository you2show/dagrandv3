
import React, { useState } from 'react';
import { MapPin, Phone, Mail, Clock, Send, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useForm, ValidationError } from '@formspree/react';
import { CONTACT_INFO } from '../../constants';
import { PageHeader } from '../components/PageHeader';
import { SEO } from '../components/SEO';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';

const MotionDiv = motion.div as any;

const Contact = () => {
  const { t, getContent } = useLanguage();
  const address = getContent(CONTACT_INFO.address, CONTACT_INFO.address_cn);
  const hours = getContent(CONTACT_INFO.businessHours, CONTACT_INFO.businessHours_cn);

  // Formspree Hook
  const [state, handleSubmit] = useForm("info@dagrand.net"); // Using email directly for Formspree (requires verification)

  // Local state for UI feedback if needed
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  if (state.succeeded) {
    return (
        <div className="bg-brand-gray dark:bg-brand-dark min-h-screen flex flex-col transition-colors duration-300">
            <PageHeader title={t('contact')} subtitle={t('contactSubtitle')} />
            <div className="max-w-3xl mx-auto px-4 py-20 text-center">
                <div className="bg-white dark:bg-white/5 p-12 shadow-xl border-t-4 border-brand-gold">
                    <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Send className="h-10 w-10 text-green-600 dark:text-green-400" />
                    </div>
                    <h2 className="text-3xl font-serif font-bold text-brand-navy dark:text-white mb-4">Message Sent Successfully!</h2>
                    <p className="text-gray-600 dark:text-gray-300 mb-8">
                        Thank you for reaching out to Dagrand Law Office. We have received your message and will get back to you shortly.
                    </p>
                    <button 
                        onClick={() => window.location.reload()}
                        className="bg-brand-navy text-white px-8 py-3 uppercase tracking-widest text-sm font-bold hover:bg-brand-gold transition-colors"
                    >
                        Send Another Message
                    </button>
                </div>
            </div>
        </div>
    );
  }

  return (
  <div className="bg-brand-gray dark:bg-brand-dark min-h-screen flex flex-col transition-colors duration-300">
    <SEO 
        title={t('contact')}
        description="Get in touch with Dagrand Law Office. We are available for consultations in English, French, Chinese, and Khmer."
    />
    <PageHeader 
        title={t('contact')} 
        subtitle={t('contactSubtitle')} 
    />

     <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <MotionDiv 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="bg-white dark:bg-white/5 shadow-xl overflow-hidden flex flex-col lg:flex-row relative z-10"
        >
            {/* Info Section */}
            <div className="lg:w-5/12 bg-brand-navy text-white p-10 md:p-14">
                <h2 className="text-3xl font-serif font-bold mb-8">{t('getInTouchTitle')}</h2>
                <p className="text-gray-300 mb-12 leading-relaxed font-light">
                    {t('consultationAvail')}
                </p>
                
                <div className="space-y-8">
                    <div className="flex items-start gap-5">
                        <MapPin className="h-6 w-6 text-brand-gold shrink-0 mt-1" />
                        <div>
                            <h3 className="font-bold text-white mb-1">{t('ourOffice')}</h3>
                            <p className="text-gray-400 text-sm leading-relaxed">{address}</p>
                        </div>
                    </div>

                    <div className="flex items-start gap-5">
                        <Clock className="h-6 w-6 text-brand-gold shrink-0 mt-1" />
                        <div>
                            <h3 className="font-bold text-white mb-1">{t('businessHours')}</h3>
                            <p className="text-gray-400 text-sm">{hours}</p>
                        </div>
                    </div>

                    <div className="flex items-start gap-5">
                        <Phone className="h-6 w-6 text-brand-gold shrink-0 mt-1" />
                        <div>
                            <h3 className="font-bold text-white mb-1">{t('phone')}</h3>
                            <div className="space-y-1">
                                {CONTACT_INFO.phones.map((p, i) => (
                                    <p key={i} className="text-gray-400 text-sm">{p.number} <span className="text-xs text-brand-gold/70 ml-2">({p.label})</span></p>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-start gap-5">
                        <Mail className="h-6 w-6 text-brand-gold shrink-0 mt-1" />
                        <div>
                            <h3 className="font-bold text-white mb-1">{t('email')}</h3>
                            <p className="text-gray-400 text-sm">{CONTACT_INFO.email}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Form Section */}
            <div className="lg:w-7/12 p-10 md:p-14">
                <h2 className="text-2xl font-serif font-bold text-brand-navy dark:text-white mb-8">{t('sendMessage')}</h2>
                <form className="space-y-6" onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="group">
                            <label htmlFor="name" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">{t('fullName')}</label>
                            <input 
                                id="name"
                                type="text" 
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 focus:bg-white dark:focus:bg-white/10 text-brand-navy dark:text-white focus:border-brand-navy outline-none transition-all" 
                                placeholder="John Doe" 
                                required
                            />
                            <ValidationError prefix="Name" field="name" errors={state.errors} className="text-red-500 text-xs mt-1" />
                        </div>
                        <div className="group">
                            <label htmlFor="email" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">{t('emailAddress')}</label>
                            <input 
                                id="email"
                                type="email" 
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 focus:bg-white dark:focus:bg-white/10 text-brand-navy dark:text-white focus:border-brand-navy outline-none transition-all" 
                                placeholder="email@example.com" 
                                required
                            />
                            <ValidationError prefix="Email" field="email" errors={state.errors} className="text-red-500 text-xs mt-1" />
                        </div>
                    </div>
                    <div className="group">
                        <label htmlFor="subject" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">{t('subject')}</label>
                        <input 
                            id="subject"
                            type="text" 
                            name="subject"
                            value={formData.subject}
                            onChange={handleChange}
                            className="w-full px-4 py-3 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 focus:bg-white dark:focus:bg-white/10 text-brand-navy dark:text-white focus:border-brand-navy outline-none transition-all" 
                            placeholder="Legal Inquiry..." 
                        />
                        <ValidationError prefix="Subject" field="subject" errors={state.errors} className="text-red-500 text-xs mt-1" />
                    </div>
                    <div className="group">
                        <label htmlFor="message" className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">{t('message')}</label>
                        <textarea 
                            id="message"
                            rows={5} 
                            name="message"
                            value={formData.message}
                            onChange={handleChange}
                            className="w-full px-4 py-3 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 focus:bg-white dark:focus:bg-white/10 text-brand-navy dark:text-white focus:border-brand-navy outline-none transition-all" 
                            placeholder="How can we help you?"
                            required
                        ></textarea>
                        <ValidationError prefix="Message" field="message" errors={state.errors} className="text-red-500 text-xs mt-1" />
                    </div>
                    <button 
                        type="submit"
                        disabled={state.submitting}
                        className="bg-brand-gold text-white font-bold py-4 px-8 uppercase tracking-widest text-sm hover:bg-brand-navy transition-all duration-300 w-full md:w-auto flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {state.submitting ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4" />}
                        {state.submitting ? 'Sending...' : t('sendBtn')}
                    </button>
                    {state.errors && (
                        <p className="text-red-500 text-sm mt-4">
                            There was an error sending your message. Please try again or contact us directly at {CONTACT_INFO.email}.
                        </p>
                    )}
                </form>
            </div>
        </MotionDiv>
     </div>

     {/* Google Map Section - Interactive & Premium Styled */}
     <div className="w-full h-[500px] relative border-t-4 border-brand-gold">
        <iframe 
            width="100%" 
            height="100%" 
            id="gmap_canvas" 
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3908.895476313174!2d104.9272744!3d11.5505192!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3109513b63999999%3A0x6a0a0a0a0a0a0a0a!2sDagrand%20Law%20Office!5e0!3m2!1sen!2skh!4v1712280000000!5m2!1sen!2skh" 
            frameBorder="0" 
            scrolling="no" 
            marginHeight={0} 
            marginWidth={0}
            title="Dagrand Law Office Location"
            className="w-full h-full grayscale hover:grayscale-0 transition-all duration-700 ease-in-out"
            allowFullScreen
            loading="lazy"
        ></iframe>
        {/* Overlay Label for Desktop */}
        <div className="absolute top-10 right-10 bg-white dark:bg-brand-navy p-6 shadow-2xl rounded-sm max-w-xs hidden md:block border-l-4 border-brand-navy dark:border-brand-gold">
            <h4 className="font-serif font-bold text-brand-navy dark:text-white text-lg mb-2">{t('visitOffice')}</h4>
            <p className="text-gray-500 dark:text-gray-300 text-sm leading-relaxed">
                {address}
            </p>
            <a 
                href="https://maps.app.goo.gl/dhfpZAuMW19qa5tg7" 
                target="_blank" 
                rel="noreferrer"
                className="inline-block mt-4 text-brand-gold hover:text-brand-navy dark:hover:text-white text-xs font-bold uppercase tracking-widest transition-colors"
            >
                Open in Google Maps
            </a>
        </div>
     </div>
  </div>
  );
};

export default Contact;
