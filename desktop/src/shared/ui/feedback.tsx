import { useState } from 'react';
import Icon from './Icon';

export function useActionFeedback() {
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const notify = (message: string, error = false) => setFeedback({ message, error });
  const notice = feedback && <div className="desktop-feedback" data-error={feedback.error || undefined}>
    <span role={feedback.error ? 'alert' : 'status'}><Icon name={feedback.error ? 'error' : 'check_circle'} /> {feedback.message}</span>
    <button type="button" aria-label="Dismiss message" onClick={() => setFeedback(null)}><Icon name="close" size={16} /></button>
  </div>;
  return { notify, notice };
}
