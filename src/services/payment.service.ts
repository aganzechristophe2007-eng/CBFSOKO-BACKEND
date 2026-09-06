export interface PaymentProvider {
  initializePayment(amount: number, currency: string, phoneOrCard: string): Promise<{ success: boolean; transactionId?: string; message: string }>;
}

export class AirtelMoneyProvider implements PaymentProvider {
  async initializePayment(amount: number, currency: string, phone: string) {
    return { success: false, message: "Service Airtel Money non configuré. Veuillez ajouter vos clés API officielles." };
  }
}

export class OrangeMoneyProvider implements PaymentProvider {
  async initializePayment(amount: number, currency: string, phone: string) {
    return { success: false, message: "Service Orange Money non configuré." };
  }
}

export class MPesaProvider implements PaymentProvider {
  async initializePayment(amount: number, currency: string, phone: string) {
    return { success: false, message: "Service M-Pesa non configuré." };
  }
}
