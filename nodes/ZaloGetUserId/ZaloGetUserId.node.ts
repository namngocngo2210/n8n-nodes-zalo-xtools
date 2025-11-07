import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';
import { API, Zalo } from 'zca-js';
import { verifyLicenseCode } from '../utils/helper';

let api: API | undefined;

export class ZaloGetUserId implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zalo Get User ID',
		name: 'zaloGetUserId',
		icon: 'file:../shared/zalo.svg',
		// @ts-ignore
		group: ['Zalo'],
		version: 1,
		description: 'Lấy User ID của tài khoản Zalo hiện tại',
		defaults: {
			name: 'Zalo Get User ID',
		},
		// @ts-ignore
		inputs: ['main'],
		// @ts-ignore
		outputs: ['main'],
		credentials: [
			{
				name: 'zaloApi',
				required: true,
				displayName: 'Zalo Credential to connect with',
			},
		],
		properties: [],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const zaloCred = await this.getCredentials('zaloApi');

		// Verify license code
		await verifyLicenseCode(zaloCred.licenseCode as string | undefined, this.getNode());

		// Parse credentials
		const cookieFromCred = JSON.parse(zaloCred.cookie as string);
		const imeiFromCred = zaloCred.imei as string;
		const userAgentFromCred = zaloCred.userAgent as string;

		// Initialize Zalo API
		try {
			const zalo = new Zalo();
			api = await zalo.login({
				cookie: cookieFromCred,
				imei: imeiFromCred,
				userAgent: userAgentFromCred,
			});

			if (!api) {
				throw new NodeOperationError(this.getNode(), 'Failed to initialize Zalo API. Check your credentials.');
			}
		} catch (error) {
			throw new NodeOperationError(this.getNode(), `Zalo login error: ${(error as Error).message}`);
		}

		for (let i = 0; i < items.length; i++) {
			try {
				if (!api) {
					throw new NodeOperationError(this.getNode(), 'Zalo API not initialized', { itemIndex: i });
				}

				// Lấy User ID của chính mình
				const userId = api.getOwnId();

				this.logger.info('Got user ID successfully', { userId });

				returnData.push({
					json: {
						success: true,
						userId: userId,
					},
					pairedItem: {
						item: i,
					},
				});
			} catch (error) {
				this.logger.error('Error getting user ID:', error);

				if (this.continueOnFail()) {
					returnData.push({
						json: {
							success: false,
							error: (error as Error).message,
						},
						pairedItem: {
							item: i,
						},
					});
				} else {
					throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
				}
			}
		}

		return [returnData];
	}
}

