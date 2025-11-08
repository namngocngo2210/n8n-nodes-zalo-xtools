import axios from 'axios';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NodeOperationError } from 'n8n-workflow';

/**
 * Tải file bất kỳ (ảnh, pdf, zip...) và lưu vào thư mục tạm trong n8n
 */
export async function saveFile(url: string): Promise<string | null> {
	try {
		const n8nUserFolder = process.env.N8N_USER_FOLDER || path.join(os.homedir(), '.n8n');
		const dataStoragePath = path.join(n8nUserFolder, 'temp_files');

		if (!fs.existsSync(dataStoragePath)) {
			fs.mkdirSync(dataStoragePath, { recursive: true });
		}

		// Lấy phần mở rộng từ URL (nếu có), ví dụ: .png, .pdf
		const urlPath = new URL(url).pathname;
		const ext = path.extname(urlPath) || '.bin';

		const timestamp = Date.now();
		const filePath = path.join(dataStoragePath, `temp-${timestamp}${ext}`);

		const { data } = await axios.get(url, { responseType: 'arraybuffer' });
		fs.writeFileSync(filePath, data); // đúng kiểu nhị phân

		return filePath;
	} catch (error) {
		console.error('Lỗi khi tải/lưu file:', error);
		return null;
	}
}

/**
 * Alias cho saveFile - để tương thích với code cũ
 */
export async function saveImage(url: string): Promise<string | null> {
	return saveFile(url);
}

/**
 * Xoá file đã lưu
 */
export function removeFile(filePath: string): void {
	try {
		if (fs.existsSync(filePath)) {
			fs.unlinkSync(filePath);
		}
	} catch (error) {
		console.error('Lỗi khi xoá file:', error);
	}
}

/**
 * Alias cho removeFile - để tương thích với code cũ
 */
export function removeImage(filePath: string): void {
	removeFile(filePath);
}

/**
 * Verify license code với API
 */
export async function verifyLicenseCode(licenseCode: string | undefined, node?: any, credentials?: any): Promise<void> {
	if (!licenseCode || licenseCode.trim() === '') {
		throw new NodeOperationError(
			node,
			'License code is required. Please add your license code in the Zalo API credential settings.',
		);
	}

	// Format số điện thoại: thay +84 thành 0
	let phoneNumber = credentials?.phoneNumber;
	if (phoneNumber) {
		phoneNumber = phoneNumber.replace(/^\+84/, '0');
	}

	try {
		const response = await axios.post('https://api.diveinthebluesky.xyz/verify', {
			code: licenseCode,
			phone_number: phoneNumber || undefined,
		});

		const { valid, expired_at } = response.data;

		if (!valid) {
			throw new NodeOperationError(
				node,
				'Invalid license code. Please check your license code in the Zalo API credential settings.',
			);
		}

		// Kiểm tra expired_at nếu có
		if (expired_at && expired_at < Math.floor(Date.now() / 1000)) {
			throw new NodeOperationError(
				node,
				'License code has expired. Please renew your license.',
			);
		}
	} catch (error: any) {
		if (error instanceof NodeOperationError) {
			throw error;
		}

		// Nếu lỗi từ API
		if (error.response) {
			const status = error.response.status;
			if (status === 400 || status === 401) {
				throw new NodeOperationError(
					node,
					'Invalid license code. Please check your license code in the Zalo API credential settings.',
				);
			}
			if (status === 403) {
				throw new NodeOperationError(
					node,
					'This license code is already being used by another credential. Each license code can only be used with one credential.',
				);
			}
		}

		// Lỗi network hoặc lỗi khác
		throw new NodeOperationError(
			node,
			`Failed to verify license code: ${error.message}. Please check your internet connection and try again.`,
		);
	}
}
