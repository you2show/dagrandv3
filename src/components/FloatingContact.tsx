import React, { useState } from 'react';
import { MessageCircle, X, Send } from 'lucide-react';
import { sendTelegramMessage } from '../lib/telegram';

export default function FloatingContact() {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', phone: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await sendTelegramMessage(formData);
      setSuccess(true);
      setFormData({ name: '', phone: '', message: '' });
      setTimeout(() => {
        setSuccess(false);
        setIsOpen(false);
      }, 3000);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen && (
        <div className="absolute bottom-16 right-0 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden mb-4">
          <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
            <h3 className="font-medium">Send us a message</h3>
            <button onClick={() => setIsOpen(false)} className="text-white hover:text-gray-200">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4">
            {success ? (
              <div className="text-green-600 text-center py-4">Message sent successfully!</div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <input required type="text" placeholder="Your Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm focus:ring-blue-500 focus:border-blue-500" />
                <input required type="tel" placeholder="Your Phone Number" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm focus:ring-blue-500 focus:border-blue-500" />
                <textarea required placeholder="How can we help?" rows={3} value={formData.message} onChange={e => setFormData({...formData, message: e.target.value})} className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm focus:ring-blue-500 focus:border-blue-500"></textarea>
                <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md flex items-center justify-center text-sm disabled:opacity-50">
                  {loading ? 'Sending...' : <><Send className="w-4 h-4 mr-2" /> Send Message</>}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
      <button onClick={() => setIsOpen(!isOpen)} className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg transition-transform hover:scale-105">
        {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>
    </div>
  );
}
