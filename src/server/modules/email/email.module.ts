import { provide } from '@/server/core/container';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';

provide(EmailService, () => new EmailService());
provide(EmailController, () => new EmailController());

export { EmailService, EmailController };
