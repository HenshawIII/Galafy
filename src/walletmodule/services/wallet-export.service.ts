import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { WalletmoduleService } from '../walletmodule.service.js';
import { ProviderService } from '../../provider/provider.service.js';
import { DatabaseService } from '../../database/database.service.js';
import * as csv from 'fast-csv';
import PDFDocument from 'pdfkit';
import { toDisplayAmount } from '../../common/utils/money.util.js';

interface TransactionData {
  id: string;
  type: string;
  amount: number;
  balance: number;
  description?: string;
  reference?: string;
  timestamp: string;
}

@Injectable()
export class WalletExportService {
  constructor(
    private readonly walletmoduleService: WalletmoduleService,
    private readonly providerService: ProviderService,
    private readonly databaseService: DatabaseService,
  ) {}

  /**
   * Verify wallet ownership
   */
  async verifyWalletOwnership(accountNumber: string, userId: string): Promise<void> {
    const wallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: accountNumber },
      include: { customer: true },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    if (wallet.customer.userId !== userId) {
      throw new UnauthorizedException('You do not have permission to export this wallet\'s transaction history');
    }
  }

  /**
   * Fetch all transactions for a date range (handles pagination)
   */
  async fetchAllTransactions(
    accountNumber: string,
    fromDate: string,
    toDate: string,
  ): Promise<TransactionData[]> {
    const allTransactions: TransactionData[] = [];
    let currentPage = 1;
    const pageSize = 100; // Fetch 100 at a time
    let hasMore = true;

    while (hasMore) {
      const response = await this.providerService.getWalletHistoryByAccountNumber(
        accountNumber,
        fromDate,
        toDate,
        currentPage,
        pageSize,
      );

      if (response.transactions && response.transactions.length > 0) {
        allTransactions.push(...response.transactions);
      }

      // Check if there are more pages
      if (response.total && response.page && response.limit) {
        const totalPages = Math.ceil(response.total / response.limit);
        hasMore = currentPage < totalPages;
        currentPage++;
      } else {
        hasMore = false;
      }
    }

    return allTransactions;
  }

  /**
   * Generate CSV file from transaction data
   */
  async generateCSV(transactions: TransactionData[], walletInfo: { accountNumber: string; customerName?: string }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const rows: any[] = [];
      
      // Add header row
      rows.push([
        'Date',
        'Time',
        'Type',
        'Amount (NGN)',
        'Balance (NGN)',
        'Reference',
        'Description',
        'Transaction ID',
      ]);

      // Add transaction rows
      transactions.forEach((tx) => {
        const date = new Date(tx.timestamp);
        const dateStr = date.toISOString().split('T')[0];
        const timeStr = date.toTimeString().split(' ')[0];
        
        rows.push([
          dateStr,
          timeStr,
          tx.type === 'CREDIT' ? 'Credit' : 'Debit',
          tx.amount.toFixed(2),
          tx.balance.toFixed(2),
          tx.reference || '',
          tx.description || '',
          tx.id,
        ]);
      });

      // Convert to CSV using fast-csv
      const chunks: Buffer[] = [];
      const stream = csv.write(rows, { headers: false });

      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      stream.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Generate PDF file from transaction data
   */
  async generatePDF(
    transactions: TransactionData[],
    walletInfo: { accountNumber: string; customerName?: string; availableBalance?: number; ledgerBalance?: number },
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (error) => reject(error));

      // Header
      doc.fontSize(20).text('Transaction History', { align: 'center' });
      doc.moveDown();
      
      // Wallet Information
      doc.fontSize(12);
      doc.text(`Account Number: ${walletInfo.accountNumber}`);
      if (walletInfo.customerName) {
        doc.text(`Account Name: ${walletInfo.customerName}`);
      }
      if (walletInfo.availableBalance !== undefined) {
        doc.text(`Available Balance: ₦${walletInfo.availableBalance.toFixed(2)}`);
      }
      if (walletInfo.ledgerBalance !== undefined) {
        doc.text(`Ledger Balance: ₦${walletInfo.ledgerBalance.toFixed(2)}`);
      }
      doc.moveDown();

      // Summary
      const credits = transactions.filter((tx) => tx.type === 'CREDIT');
      const debits = transactions.filter((tx) => tx.type === 'DEBIT');
      const totalCredits = credits.reduce((sum, tx) => sum + tx.amount, 0);
      const totalDebits = debits.reduce((sum, tx) => sum + tx.amount, 0);

      doc.fontSize(14).text('Summary', { underline: true });
      doc.fontSize(10);
      doc.text(`Total Credits: ₦${totalCredits.toFixed(2)}`);
      doc.text(`Total Debits: ₦${totalDebits.toFixed(2)}`);
      doc.text(`Net Amount: ₦${(totalCredits - totalDebits).toFixed(2)}`);
      doc.text(`Total Transactions: ${transactions.length}`);
      doc.moveDown();

      // Transactions Table Header
      doc.fontSize(12).text('Transactions', { underline: true });
      doc.moveDown(0.5);

      // Table headers
      const tableTop = doc.y;
      const tableLeft = 50;
      const colWidths = [80, 60, 80, 80, 100, 120, 80];
      const rowHeight = 20;

      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Date', tableLeft, tableTop);
      doc.text('Time', tableLeft + colWidths[0], tableTop);
      doc.text('Type', tableLeft + colWidths[0] + colWidths[1], tableTop);
      doc.text('Amount', tableLeft + colWidths[0] + colWidths[1] + colWidths[2], tableTop);
      doc.text('Balance', tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], tableTop);
      doc.text('Description', tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], tableTop);
      doc.text('Reference', tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + colWidths[5], tableTop);

      // Draw header line
      doc.moveTo(tableLeft, tableTop + 15).lineTo(tableLeft + 700, tableTop + 15).stroke();
      doc.moveDown();

      // Transaction rows
      doc.font('Helvetica').fontSize(9);
      let yPos = doc.y;

      transactions.forEach((tx, index) => {
        // Check if we need a new page
        if (yPos > 750) {
          doc.addPage();
          yPos = 50;
        }

        const date = new Date(tx.timestamp);
        const dateStr = date.toISOString().split('T')[0];
        const timeStr = date.toTimeString().split(' ')[0];

        doc.text(dateStr, tableLeft, yPos);
        doc.text(timeStr, tableLeft + colWidths[0], yPos);
        doc.text(tx.type === 'CREDIT' ? 'Credit' : 'Debit', tableLeft + colWidths[0] + colWidths[1], yPos);
        doc.text(`₦${tx.amount.toFixed(2)}`, tableLeft + colWidths[0] + colWidths[1] + colWidths[2], yPos);
        doc.text(`₦${tx.balance.toFixed(2)}`, tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], yPos);
        doc.text((tx.description || '').substring(0, 30), tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], yPos, { width: colWidths[4], ellipsis: true });
        doc.text((tx.reference || '').substring(0, 20), tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + colWidths[5], yPos, { width: colWidths[5], ellipsis: true });

        yPos += rowHeight;

        // Draw row separator
        if (index < transactions.length - 1) {
          doc.moveTo(tableLeft, yPos - 5).lineTo(tableLeft + 700, yPos - 5).stroke();
        }
      });

      // Footer
      doc.fontSize(8).text(
        `Generated on ${new Date().toLocaleString()}`,
        50,
        doc.page.height - 50,
        { align: 'center' },
      );

      doc.end();
    });
  }

  /**
   * Export wallet transaction history
   */
  async exportWalletHistory(
    accountNumber: string,
    userId: string,
    format: 'csv' | 'pdf',
    startDate: string,
    endDate: string,
  ): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    // Verify wallet ownership
    await this.verifyWalletOwnership(accountNumber, userId);

    // Get wallet info
    const wallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: accountNumber },
      include: { customer: { include: { user: true } } },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    // Validate date range
    const fromDate = new Date(startDate);
    const toDate = new Date(endDate);
    
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
    }

    if (fromDate > toDate) {
      throw new BadRequestException('Start date must be before or equal to end date');
    }

    // Fetch all transactions
    const transactions = await this.fetchAllTransactions(accountNumber, startDate, endDate);

    if (transactions.length === 0) {
      throw new NotFoundException('No transactions found for the specified date range');
    }

    // Prepare wallet info
    const walletInfo = {
      accountNumber,
      customerName: wallet.customer.user?.firstName && wallet.customer.user?.lastName
        ? `${wallet.customer.user.firstName} ${wallet.customer.user.lastName}`
        : undefined,
      availableBalance: wallet.availableBalance ? toDisplayAmount(wallet.availableBalance) : undefined,
      ledgerBalance: wallet.ledgerBalance ? toDisplayAmount(wallet.ledgerBalance) : undefined,
    };

    // Generate file based on format
    let buffer: Buffer;
    let filename: string;
    let mimeType: string;

    if (format === 'csv') {
      buffer = await this.generateCSV(transactions, walletInfo);
      filename = `wallet-transactions-${accountNumber}-${startDate}-to-${endDate}.csv`;
      mimeType = 'text/csv';
    } else {
      buffer = await this.generatePDF(transactions, walletInfo);
      filename = `wallet-transactions-${accountNumber}-${startDate}-to-${endDate}.pdf`;
      mimeType = 'application/pdf';
    }

    return { buffer, filename, mimeType };
  }
}




