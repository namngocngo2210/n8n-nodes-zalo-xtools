import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError
} from 'n8n-workflow';
import { API, ThreadType, Zalo } from 'zca-js';
import { saveFile, removeFile } from '../utils/helper';
import fs from 'fs';

let api: API | undefined;

export class ZaloSendMessage implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zalo Send Message',
		name: 'zaloSendMessage',
		icon: 'file:../shared/zalo.svg',
		group: ['Zalo'],
		version: 4,
		description: 'Gửi tin nhắn qua API Zalo sử dụng kết nối đăng nhập bằng cookie',
		defaults: {
			name: 'Zalo Send Message',
		},
		// @ts-ignore
		inputs: ['main'],
		// @ts-ignore
		outputs: ['main'],
		credentials: [
			{
				name: 'zaloApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Thread ID',
				name: 'threadId',
				type: 'string',
				default: '',
				required: true,
				description: 'ID của thread để gửi tin nhắn',
			},
			{
				displayName: 'Type',
				name: 'type',
				type: 'options',
				options: [
					{
						name: 'User',
						value: 0,
					},
					{
						name: 'Group',
						value: 1,
					},
				],
				default: 0,
				description: 'Loại của tin nhắn (user hoặc group)',
			},
			{
				displayName: 'Message',
				name: 'message',
				type: 'string',
				default: '',
				required: true,
				description: 'Nội dung tin nhắn cần gửi',
			},
			{
				displayName: 'Urgency',
				name: 'urgency',
				type: 'options',
				options: [
					{
						name: 'Default',
						value: 0,
					},
					{
						name: 'Important',
						value: 1,
					},
					{
						name: 'Urgent',
						value: 2,
					},
				],
				default: 0,
				description: 'Mức độ khẩn cấp của tin nhắn',
			},
			{
				displayName: 'Quote Message',
				name: 'quote',
				type: 'collection',
				placeholder: 'Add Quote',
				default: {},
				options: [
					{
						displayName: 'Message ID',
						name: 'msgId',
						type: 'string',
						default: '',
						description: 'ID của tin nhắn cần trích dẫn',
					},
					{
						displayName: 'Sender ID',
						name: 'senderId',
						type: 'string',
						default: '',
						description: 'ID của người gửi tin nhắn trích dẫn',
					},
					{
						displayName: 'Content',
						name: 'content',
						type: 'string',
						default: '',
						description: 'Nội dung tin nhắn trích dẫn',
					},
				],
			},
			{
				displayName: 'Mentions',
				name: 'mentions',
				type: 'collection',
				placeholder: 'Add Mention',
				default: {},
				options: [
					{
						displayName: 'User ID',
						name: 'uid',
						type: 'string',
						default: '',
						description: 'ID của người dùng được mention',
					},
					{
						displayName: 'Position',
						name: 'pos',
						type: 'number',
						default: 0,
						description: 'Vị trí mention trong tin nhắn',
					},
					{
						displayName: 'Length',
						name: 'len',
						type: 'number',
						default: 0,
						description: 'Độ dài của mention',
					},
				],
			},
			{
				displayName: 'Attachments',
				name: 'attachments',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				placeholder: 'Add Attachment',
				default: {},
				options: [
					{
						name: 'attachment',
						displayName: 'Attachment',
						values: [
							{
								displayName: 'Type',
								name: 'type',
								type: 'options',
								options: [
									{
										name: 'Image URL/File URL',
										value: 'url',
									}
								],
								default: 'url',
								description: 'Loại file đính kèm',
							},
							{
								displayName: 'Image URL/File URL',
								name: 'imageUrl',
								type: 'string',
								default: '',
								displayOptions: {
									show: {
										'type': ['url'],
									},
								},
								description: 'URL công khai của ảnh hoặc file',
							}
						],
					},
				],
				description: 'Một hoặc nhiều ảnh đính kèm để gửi',
			},
		],
	};


	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const returnData: INodeExecutionData[] = [];
		const items = this.getInputData();
		const zaloCred = await this.getCredentials('zaloApi');

		// Parse credentials
		const cookieFromCred = JSON.parse(zaloCred.cookie as string);
		const imeiFromCred = zaloCred.imei as string;
		const userAgentFromCred = zaloCred.userAgent as string;

		// Initialize imageMetadataGetter for V2 migration
		// Required for sending images/gifs by file path in zca-js v2.0.0+
		// Sharp is optional - only try to load it when needed
		const self = this;
		async function imageMetadataGetter(filePath: string) {
			try {
				console.log(`[imageMetadataGetter] Getting metadata for file: ${filePath}`);
				self.logger.info(`Getting metadata for file: ${filePath}`);
				
				if (!fs.existsSync(filePath)) {
					const errorMsg = `File not found: ${filePath}`;
					console.error(`[imageMetadataGetter] ${errorMsg}`);
					self.logger.error(errorMsg);
					throw new NodeOperationError(self.getNode(), errorMsg);
				}
				
				const data = await fs.promises.readFile(filePath);
				console.log(`[imageMetadataGetter] File read successfully, size: ${data.length} bytes`);
				
				// Try to load sharp dynamically (optional dependency)
				let sharp: any = null;
				try {
					// eslint-disable-next-line
					sharp = require('sharp');
					console.log('[imageMetadataGetter] Sharp module loaded successfully');
					self.logger.info('Sharp module loaded successfully');
				} catch (requireError: any) {
					// sharp không khả dụng - sẽ dùng fallback
					console.warn(`[imageMetadataGetter] Sharp module not available: ${requireError.message}, using fallback metadata`);
					self.logger.warn('Sharp module not available, using fallback metadata');
					sharp = null;
				}
				
				// Sử dụng sharp nếu có, nếu không thì fallback
				if (sharp) {
					try {
						const metadata = await sharp(data).metadata();
						const result = {
							height: metadata.height || 0,
							width: metadata.width || 0,
							size: metadata.size || data.length,
						};
						console.log(`[imageMetadataGetter] Metadata extracted: ${JSON.stringify(result)}`);
						self.logger.info(`Metadata extracted: ${JSON.stringify(result)}`);
						return result;
					} catch (sharpError: any) {
						// Sharp error, fallback to file size only
						console.warn(`[imageMetadataGetter] Sharp error: ${sharpError.message}, using fallback`);
						self.logger.warn(`Sharp error: ${sharpError.message}, using fallback`);
						const fallback = {
							height: 0,
							width: 0,
							size: data.length,
						};
						console.log(`[imageMetadataGetter] Using fallback: ${JSON.stringify(fallback)}`);
						return fallback;
					}
				} else {
					// Sharp không khả dụng, chỉ trả về size
					const fallback = {
						height: 0,
						width: 0,
						size: data.length,
					};
					console.log(`[imageMetadataGetter] Using fallback metadata (size only): ${data.length} bytes, result: ${JSON.stringify(fallback)}`);
					self.logger.info(`Using fallback metadata (size only): ${data.length} bytes`);
					return fallback;
				}
			} catch (error: any) {
				console.error(`[imageMetadataGetter] Error getting metadata: ${error.message}`, error);
				self.logger.error(`Error getting metadata: ${error.message}`);
				// Fallback nếu không đọc được file
				try {
					const data = await fs.promises.readFile(filePath);
					const fallback = {
						height: 0,
						width: 0,
						size: data.length,
					};
					console.log(`[imageMetadataGetter] Fallback after error: ${JSON.stringify(fallback)}`);
					return fallback;
				} catch (readError: any) {
					console.error(`[imageMetadataGetter] Cannot read file: ${readError.message}`, readError);
					self.logger.error(`Cannot read file: ${readError.message}`);
					throw readError;
				}
			}
		}

		// Initialize Zalo API
		try {
			const zalo = new Zalo({
				imageMetadataGetter,
			});
			api = await zalo.login({ 
				cookie: cookieFromCred,
				imei: imeiFromCred, 
				userAgent: userAgentFromCred 
			});
			
			if (!api) {
				throw new NodeOperationError(this.getNode(), 'Failed to initialize Zalo API. Check your credentials.');
			}
		} catch (error) {
			throw new NodeOperationError(this.getNode(), `Zalo login error: ${(error as Error).message}`);
		}

		for (let i = 0; i < items.length; i++) {
			try {
				// Get parameters
				const threadId = this.getNodeParameter('threadId', i) as string;
				const typeNumber = this.getNodeParameter('type', i) as number;
				const type = typeNumber === 0 ? ThreadType.User : ThreadType.Group;
				const message = this.getNodeParameter('message', i) as string;
				const urgency = this.getNodeParameter('urgency', i, 0) as number;
				const quote = this.getNodeParameter('quote', i, {}) as any;
				const mentions = this.getNodeParameter('mentions', i, {}) as any;
				const attachments = this.getNodeParameter('attachments', i, {}) as any;

				// Create message content
				const messageContent: any = {
					msg: message,
				};

				// Add urgency if specified
				if (urgency !== 0) {
					messageContent.urgency = urgency;
				}

				// Add quote if specified
				if (quote && Object.keys(quote).length > 0) {
					messageContent.quote = {
						msgId: quote.msgId,
						senderId: quote.senderId,
						content: quote.content,
					};
				}

				// Add mentions if specified
				if (mentions && Object.keys(mentions).length > 0) {
					messageContent.mentions = [{
						pos: mentions.pos || 0,
						uid: mentions.uid,
						len: mentions.len || 0,
					}];
				}

				// Add attachments if specified
				if (attachments && attachments.attachment && attachments.attachment.length > 0) {
					this.logger.info(`Processing ${attachments.attachment.length} attachment(s)`);
					messageContent.attachments = [];
					for (const attachment of attachments.attachment) {
						let fileData;
						if (attachment.type === 'url') {
							this.logger.info(`Downloading attachment from URL: ${attachment.imageUrl}`);
							fileData = await saveFile(attachment.imageUrl);
							if (!fileData) {
								this.logger.warn(`Failed to download attachment from URL: ${attachment.imageUrl}`);
								continue; // Skip this attachment if download failed
							}
							this.logger.info(`Attachment downloaded successfully: ${fileData}`);
						}
						
						if (fileData) {
							messageContent.attachments.push(fileData);
							this.logger.info(`Added attachment to message: ${fileData}`);
						}
					}
					
					// If no valid attachments were added, clear the array
					if (messageContent.attachments.length === 0) {
						this.logger.warn('No valid attachments were added, removing attachments from message');
						delete messageContent.attachments;
					} else {
						this.logger.info(`Total attachments to send: ${messageContent.attachments.length}`);
					}
				}

				// Log the parameters before sending
				this.logger.info(`Sending message with parameters: ${JSON.stringify(messageContent)}`);
				console.log('=== ZALO SEND MESSAGE DEBUG ===');
				console.log('Message Content:', JSON.stringify(messageContent, null, 2));
				console.log('Has attachments:', !!messageContent.attachments);
				console.log('Attachments count:', messageContent.attachments?.length || 0);
				console.log('Attachments:', messageContent.attachments);
				console.log('=== END DEBUG ===');
				// Send the message
				if (!api) {
					throw new NodeOperationError(this.getNode(), 'Zalo API not initialized');
				}

				//Send typing event
				try {
					const recipentObj = {
						id : threadId,
						type: type
					}
					const result = await api.sendTypingEvent(recipentObj.id, recipentObj.type);
					if (!!result) {
						this.logger.info("Send! typing event")
					}
				}
				catch (e) {
					this.logger.error("Cannot send typing event")
				}
				
				// Send message
				const response = await api.sendMessage(messageContent, threadId, type);

				//Remove temp img
				if (messageContent.attachments && messageContent.attachments.length > 0){
					for (const attachment of messageContent.attachments) {
						this.logger.info(`Remove attachment: ${attachment}`);

						removeFile(attachment)
					}
				}
				this.logger.info('Message sent successfully', { threadId, type });


				returnData.push({
					json: {
						success: true,
						response,
						threadId,
						threadType: type,
						messageContent,
						debug: {
							hasAttachments: !!messageContent.attachments,
							attachmentsCount: messageContent.attachments?.length || 0,
							attachments: messageContent.attachments || [],
							messageText: messageContent.msg,
						},
					},
				});
				
			} catch (error) {
				this.logger.error('Error sending Zalo message:', error);
				
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							success: false,
							error: (error as Error).message,
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
