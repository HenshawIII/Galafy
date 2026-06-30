import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import * as csv from 'fast-csv';
import PDFDocument from 'pdfkit';
import { toDisplayAmount, normalizeToKobo } from '../../common/utils/money.util.js';
import { TransactionDirection } from '../../../generated/prisma/enums.js';
import { Decimal } from '@prisma/client/runtime/library';

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
  constructor(private readonly databaseService: DatabaseService) {}

  async verifyWalletOwnership(accountNumber: string, userId: string): Promise<void> {
    const wallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: accountNumber },
      include: { customer: true },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    if (wallet.customer.userId !== userId) {
      throw new UnauthorizedException("You do not have permission to export this wallet's transaction history");
    }
  }

  async fetchAllTransactions(accountNumber: string, fromDate: string, toDate: string): Promise<TransactionData[]> {
    const wallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: accountNumber },
    });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const startRange = new Date(`${fromDate}T00:00:00.000Z`);
    const endRange = new Date(`${toDate}T23:59:59.999Z`);

    const priorRows = await this.databaseService.transaction.findMany({
      where: { walletId: wallet.id, createdAt: { lt: startRange } },
      select: { direction: true, amount: true },
    });

    let priorNet = new Decimal(0);
    for (const r of priorRows) {
      priorNet = priorNet.plus(r.direction === TransactionDirection.CREDIT ? r.amount : r.amount.neg());
    }

    const rows = await this.databaseService.transaction.findMany({
      where: {
        walletId: wallet.id,
        createdAt: { gte: startRange, lte: endRange },
      },
      orderBy: { createdAt: 'asc' },
    });

    let run = priorNet;
    const out: TransactionData[] = [];
    for (const t of rows) {
      run = normalizeToKobo(run.plus(t.direction === TransactionDirection.CREDIT ? t.amount : t.amount.neg()));
      out.push({
        id: t.id,
        type: t.direction === TransactionDirection.CREDIT ? 'CREDIT' : 'DEBIT',
        amount: toDisplayAmount(t.amount),
        balance: toDisplayAmount(run),
        description: t.narration ?? undefined,
        reference: t.reference,
        timestamp: t.createdAt.toISOString(),
      });
    }

    return out;
  }

  async generateCSV(
    transactions: TransactionData[],
    walletInfo: { accountNumber: string; customerName?: string },
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const rows: any[] = [];

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

      doc.fontSize(20).text('Transaction History', { align: 'center' });
      doc.moveDown();

      doc.fontSize(12);
      doc.text(`Account Number: ${walletInfo.accountNumber}`);
      if (walletInfo.customerName) {
        doc.text(`Account Name: ${walletInfo.customerName}`);
      }
      if (walletInfo.availableBalance !== undefined) {
        doc.text(`Available Balance (NGN): ${walletInfo.availableBalance.toFixed(2)}`);
      }
      if (walletInfo.ledgerBalance !== undefined) {
        doc.text(`Ledger Balance (NGN): ${walletInfo.ledgerBalance.toFixed(2)}`);
      }
      doc.moveDown();

      const credits = transactions.filter((tx) => tx.type === 'CREDIT');
      const debits = transactions.filter((tx) => tx.type === 'DEBIT');
      const totalCredits = credits.reduce((sum, tx) => sum + tx.amount, 0);
      const totalDebits = debits.reduce((sum, tx) => sum + tx.amount, 0);

      doc.fontSize(14).text('Summary', { underline: true });
      doc.fontSize(10);
      doc.text(`Total Credits (NGN): ${totalCredits.toFixed(2)}`);
      doc.text(`Total Debits (NGN): ${totalDebits.toFixed(2)}`);
      doc.text(`Net Amount (NGN): ${(totalCredits - totalDebits).toFixed(2)}`);
      doc.text(`Total Transactions: ${transactions.length}`);
      doc.moveDown();

      doc.fontSize(12).text('Transactions', { underline: true });
      doc.moveDown(0.5);

      const tableLeft = 50;
      const rightBoundary = doc.page.width - doc.page.margins.right;
      const tableWidth = rightBoundary - tableLeft;
      const baseRowHeight = 18;
      const footerReserve = 60;
      const getPageBottom = () => doc.page.height - doc.page.margins.bottom - footerReserve;

      const fixedColWidths = [62, 48, 44, 68, 68, 88];
      const referenceColWidth = tableWidth - fixedColWidths.reduce((sum, width) => sum + width, 0);
      const colWidths = [...fixedColWidths, referenceColWidth];

      const colX = (index: number) =>
        tableLeft + colWidths.slice(0, index).reduce((sum, width) => sum + width, 0);

      const measureWrappedHeight = (text: string, width: number, fontSize: number) => {
        doc.font('Helvetica').fontSize(fontSize);
        return Math.max(baseRowHeight, doc.heightOfString(text || '', { width, lineBreak: true }));
      };

      const drawTableHeader = (headerY: number) => {
        doc.fontSize(8).font('Helvetica-Bold');
        doc.text('Date', colX(0), headerY, { width: colWidths[0], lineBreak: false });
        doc.text('Time', colX(1), headerY, { width: colWidths[1], lineBreak: false });
        doc.text('Type', colX(2), headerY, { width: colWidths[2], lineBreak: false });
        doc.text('Amount (NGN)', colX(3), headerY, { width: colWidths[3], lineBreak: true });
        doc.text('Balance (NGN)', colX(4), headerY, { width: colWidths[4], lineBreak: true });
        doc.text('Description', colX(5), headerY, { width: colWidths[5], lineBreak: false });
        doc.text('Reference', colX(6), headerY, { width: colWidths[6], lineBreak: false });
        doc
          .moveTo(tableLeft, headerY + 22)
          .lineTo(tableLeft + tableWidth, headerY + 22)
          .stroke();
        doc.font('Helvetica').fontSize(8);
      };

      let yPos = doc.y;
      drawTableHeader(yPos);
      yPos += 28;

      transactions.forEach((tx, index) => {
        const date = new Date(tx.timestamp);
        const dateStr = date.toISOString().split('T')[0];
        const timeStr = date.toTimeString().split(' ')[0];
        const description = tx.description || '';
        const reference = tx.reference || '';

        const rowHeight = Math.max(
          measureWrappedHeight(description, colWidths[5], 8),
          measureWrappedHeight(reference, colWidths[6], 8),
        );

        if (yPos + rowHeight > getPageBottom()) {
          doc.addPage();
          yPos = doc.page.margins.top;
          drawTableHeader(yPos);
          yPos += 28;
        }

        doc.font('Helvetica').fontSize(8);
        doc.text(dateStr, colX(0), yPos, { width: colWidths[0], lineBreak: false });
        doc.text(timeStr, colX(1), yPos, { width: colWidths[1], lineBreak: false });
        doc.text(tx.type === 'CREDIT' ? 'Credit' : 'Debit', colX(2), yPos, {
          width: colWidths[2],
          lineBreak: false,
        });
        doc.text(tx.amount.toFixed(2), colX(3), yPos, { width: colWidths[3], lineBreak: false });
        doc.text(tx.balance.toFixed(2), colX(4), yPos, { width: colWidths[4], lineBreak: false });
        doc.text(description, colX(5), yPos, {
          width: colWidths[5],
          lineBreak: true,
          height: rowHeight,
        });
        doc.text(reference, colX(6), yPos, {
          width: colWidths[6],
          lineBreak: true,
          height: rowHeight,
        });

        yPos += rowHeight;
        doc.x = tableLeft;
        doc.y = yPos;

        if (index < transactions.length - 1 && yPos <= getPageBottom()) {
          doc
            .moveTo(tableLeft, yPos - 4)
            .lineTo(tableLeft + tableWidth, yPos - 4)
            .stroke();
        }
      });

      const pages = doc.bufferedPageRange();
      doc.switchToPage(pages.start + pages.count - 1);
      doc
        .fontSize(8)
        .text(`Generated on ${new Date().toLocaleString()}`, tableLeft, doc.page.height - 50, {
          width: tableWidth,
          align: 'center',
          lineBreak: false,
        });

      doc.end();
    });
  }

  async exportWalletHistory(
    accountNumber: string,
    userId: string,
    format: 'csv' | 'pdf',
    startDate: string,
    endDate: string,
  ): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    await this.verifyWalletOwnership(accountNumber, userId);

    const wallet = await this.databaseService.wallet.findFirst({
      where: { virtualAccountNumber: accountNumber },
      include: { customer: { include: { user: true } } },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const fromDate = new Date(startDate);
    const toDate = new Date(endDate);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
    }

    if (fromDate > toDate) {
      throw new BadRequestException('Start date must be before or equal to end date');
    }

    const transactions = await this.fetchAllTransactions(accountNumber, startDate, endDate);

    if (transactions.length === 0) {
      throw new NotFoundException('No transactions found for the specified date range');
    }

    const walletInfo = {
      accountNumber,
      customerName:
        wallet.customer.user?.firstName && wallet.customer.user?.lastName
          ? `${wallet.customer.user.firstName} ${wallet.customer.user.lastName}`
          : undefined,
      availableBalance: wallet.availableBalance ? toDisplayAmount(wallet.availableBalance) : undefined,
      ledgerBalance: wallet.ledgerBalance ? toDisplayAmount(wallet.ledgerBalance) : undefined,
    };

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
