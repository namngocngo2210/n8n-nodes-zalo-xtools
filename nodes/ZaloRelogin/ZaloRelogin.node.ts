import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';
import { Zalo } from 'zca-js';
import axios from 'axios';

export class ZaloRelogin implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zalo Relogin',
		name: 'zaloRelogin',
		group: ['Zalo'],
		version: 1,
		description: 'Đăng nhập lại Zalo bằng QR code và cập nhật credential cũ dựa trên số điện thoại',
		defaults: {
			name: 'Zalo Relogin',
		},
		// @ts-ignore
		inputs: ['main'],
		// @ts-ignore
		outputs: ['main'],
		icon: 'file:../shared/zalo.svg',
		credentials: [
			{
				name: 'zaloApi',
				required: false,
				displayName: 'Zalo Credential to connect with',
			},
			{
				name: 'n8nZaloApi',
				required: true,
				displayName: 'n8n Account Credential',
			},
		],
		properties: [
			{
				displayName: 'Proxy',
				name: 'proxy',
				type: 'string',
				default: '',
				placeholder: 'https://user:pass@host:port',
				description: 'HTTP proxy to use for Zalo API requests',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const returnData: INodeExecutionData[] = [];
		const proxy = this.getNodeParameter('proxy', 0, '') as string;
		const timeout = 30; // Fixed timeout of 30 seconds
		const fileName = 'zalo-qr-code.png'; // Fixed filename

		// Get the credentials if provided
		let zaloCredential: any;
		let n8nCredential: any;

		// Try to get Zalo API credential
		try {
			zaloCredential = await this.getCredentials('zaloApi');
		} catch (error) {
			// No Zalo credential selected, which is fine
		}

		// Try to get n8n API credential
		try {
			n8nCredential = await this.getCredentials('n8nZaloApi');
		} catch (error) {
			// No n8n credential selected, which is fine
		}

		// Determine which credential to use
		let selectedCredential = undefined;

		// If we have n8n credential, use it
		if (n8nCredential) {
			console.error('Using n8n account credential');
			selectedCredential = n8nCredential;
		} else if (zaloCredential) {
			console.error('Using Zalo API credential');
			selectedCredential = zaloCredential;
		} else {
			console.error('No credentials provided, will generate QR code for login');
		}

		try {
			const zaloOptions: any = {
				selfListen: true,
				logging: true,
			};

			if (proxy) {
				zaloOptions.proxy = proxy;
			}

			// Initialize Zalo
			let zalo: any;

			// If we have credentials, use them
			if (selectedCredential) {
				console.error('Using existing Zalo credentials');
				zalo = new Zalo(zaloOptions);

				// Check if we're using n8n credential or Zalo credential
				if (selectedCredential === n8nCredential) {
					// Using n8n credential - we need to get the Zalo credentials from the n8n credential
					console.error('Using n8n credential to get Zalo credentials');

					// Get the credential data from the n8n credential
					const n8nApiKey = selectedCredential.apiKey as string;
					const n8nUrl = selectedCredential.url as string || 'http://localhost:5678';

					console.error(`Using n8n API at ${n8nUrl} with API key ${n8nApiKey ? 'provided' : 'not provided'}`);

					// For now, we'll just log in with QR code since we don't have a way to get Zalo credentials from n8n
					console.error('n8n credential support is not fully implemented yet. Will use QR code login.');

					// Re-initialize Zalo without credentials
					zalo = new Zalo(zaloOptions);
				} else {
					// Using Zalo credential
					console.error('Using Zalo credential for login');

					// Use the credentials to login
					const cookie = selectedCredential.cookie as string;
					const imei = selectedCredential.imei as string;
					const userAgent = selectedCredential.userAgent as string;
					const supportCode = selectedCredential.supportCode as string;
					const licenseKey = selectedCredential.licenseKey as string;

					// Check if we have a proxy in the credential
					if (selectedCredential.proxy) {
						console.error('Using proxy from credential:', selectedCredential.proxy);
						zaloOptions.proxy = selectedCredential.proxy as string;
					}

					// Log in with the credentials
					await zalo.login({
						cookie,
						imei,
						userAgent,
						supportCode,
						licenseKey,
					} as any);
				}
			} else {
				// No credentials, create a new instance
				zalo = new Zalo(zaloOptions);
			}
			console.error('Starting Zalo QR login process...');

			// Function to process context and save credentials
			const processContext = (context: any) => {
				if (!context) {
					console.error('Context is null or undefined');
					return;
				}

				const cookie = context.cookie || '';
				const imei = context.imei || '';
				const userAgent = context.userAgent || '';

				console.error('=== ZALO CREDENTIALS ===');
				console.error('Cookie:', cookie ? `Received (length: ${typeof cookie === 'string' ? cookie.length : (Array.isArray(cookie) ? cookie.length : 'unknown')})` : 'None');
				console.error('IMEI:', imei ? imei : 'None');
				console.error('User Agent:', userAgent ? userAgent : 'None');
				console.error('=== END CREDENTIALS ===');
			};

			// Function to set up event listeners
			const setupEventListeners = (api: any) => {
				console.error('Setting up event listeners to get credentials');

				try {
					// Check if getContext is a function
					if (typeof api.getContext === 'function') {
						// Try to get context
						const contextResult = api.getContext();

						// Check if result is a promise
						if (contextResult && typeof contextResult.then === 'function') {
							// It's a promise, use .then
							contextResult.then((context: any) => {
								processContext(context);
							}).catch((error: any) => {
								console.error('Error getting context:', error);
							});
						} else {
							// It's not a promise, use directly
							processContext(contextResult);
						}
					} else {
						console.error('getContext is not a function');

						// Try to get context from the api object directly
						if (api.context) {
							console.error('Found context in api object');
							processContext(api.context);
						} else {
							console.error('No context found in api object');
						}
					}
				} catch (error) {
					console.error('Error in setupEventListeners:', error);
				}
			};

			// Generate QR code
			const qrCodePromise = new Promise<string>(async (resolve, reject) => {
				let isResolved = false;

				// Set timeout for QR code generation
				const timeoutId = setTimeout(() => {
					if (!isResolved) {
						isResolved = true;
						reject(new NodeOperationError(this.getNode(), 'Timeout generating QR code. Please try again or check your Zalo connection.'));
					}
				}, timeout * 1000); // Convert seconds to milliseconds

				try {
					// @ts-ignore - Ignore type checking for loginQR method
					let api = await zalo.loginQR(null, (qrEvent: any) => {
						console.error('Received QR event type:', qrEvent ? qrEvent.type : 'no event');

						// Handle different event types based on the LoginQRCallbackEventType enum
						switch (qrEvent.type) {
							case 0: // QRCodeGenerated
								if (qrEvent?.data?.image) {
									const qrCodeBase64 = qrEvent.data.image;
									console.error('QR code generated, length:', qrCodeBase64.length);

									// If QR code was already resolved, we don't need to do anything
									if (isResolved) return;

									// Clear timeout
									clearTimeout(timeoutId);

									// If we have a QR code, resolve with it
									if (qrCodeBase64) {
										isResolved = true;
										resolve(qrCodeBase64);
									}
								} else {
									console.error('Could not get QR code from Zalo SDK');
									reject(new Error("Could not get QR code"));
								}
								break;

							case 1: // QRCodeExpired
								console.error('QR code expired. Please try again.');
								break;

							case 2: // QRCodeScanned
								console.error('=== QR CODE SCANNED ===');
								if (qrEvent?.data) {
									console.error('User:', qrEvent.data.display_name);
									console.error('Avatar:', qrEvent.data.avatar ? 'Yes' : 'No');
								}
								break;

							case 3: // QRCodeDeclined
								console.error('=== QR CODE DECLINED ===');
								if (qrEvent?.data?.code) {
									console.error('Decline code:', qrEvent.data.code);
								}
								break;

							case 4: // GotLoginInfo
								console.error('=== GOT LOGIN INFO ===');
								if (qrEvent?.data) {
									const cookie = qrEvent.data.cookie || [];
									const imei = qrEvent.data.imei || '';
									const userAgent = qrEvent.data.userAgent || '';

									console.error('Cookie received:', cookie.length > 0 ? 'Yes' : 'No');
									console.error('IMEI received:', imei ? 'Yes' : 'No');
									console.error('User Agent received:', userAgent ? 'Yes' : 'No');

									// Save credentials to file immediately
									// Wrap trong async IIFE để có thể dùng await
									(async () => {
										try {
											// Save credentials to output directory
											if (cookie.length > 0 || imei || userAgent) {
												// Lấy thông tin user một lần để dùng cho cả credential name và credential data
												let credentialName = 'Zalo API Credentials'; // Default name
												let userName = '';
												let phoneNumber = '';
												let userId = '';

												try {
													// Login lại với cookie, imei, userAgent vừa nhận được để lấy user info
													const tempZalo = new Zalo();
													const tempApi = await tempZalo.login({
														cookie: cookie,
														imei: imei,
														userAgent: userAgent,
													} as any);

													if (tempApi) {
														// Lấy userId của chính mình
														userId = tempApi.getOwnId();
														console.error('Got user ID:', userId);

														// Lấy thông tin user
														const userInfo = await tempApi.getUserInfo(userId);
														console.error('User info received:', JSON.stringify(userInfo).substring(0, 300));

														// getUserInfo trả về object có changed_profiles hoặc unchanged_profiles
														// Tìm thông tin user trong changed_profiles hoặc unchanged_profiles
														let userProfile: any = null;
														if (userInfo.changed_profiles && userInfo.changed_profiles[userId]) {
															userProfile = userInfo.changed_profiles[userId];
														} else if (userInfo.unchanged_profiles && userInfo.unchanged_profiles[userId]) {
															userProfile = userInfo.unchanged_profiles[userId];
														}

														// Lấy name và phoneNumber từ user profile
														phoneNumber = userProfile?.phoneNumber || '';
														userName = userProfile?.displayName || userProfile?.zaloName || userProfile?.name || '';

														console.error('User name:', userName);
														console.error('Phone number:', phoneNumber);
														console.error('User ID:', userId);

														// Tạo credential name từ số điện thoại và tên
														if (phoneNumber && userName) {
															credentialName = `${userName} - ${phoneNumber}`;
														} else if (userName) {
															credentialName = userName;
														} else if (phoneNumber) {
															credentialName = phoneNumber;
														} else if (userId) {
															credentialName = `Zalo Account - ${userId}`;
														}

														console.error('Credential name:', credentialName);
													}
												} catch (userInfoError: any) {
													console.error('Error getting user info:', userInfoError.message);
													console.error('Will use default credential name and empty name/phoneNumber/userId');
												}

												// Try to update existing credential instead of creating new one
												try {
													console.error('Attempting to find and update Zalo credential via n8n API');

													// Get n8n API credentials
													const n8nApi = await this.getCredentials('n8nZaloApi');
													const n8nApiUrl = n8nApi.url as string;
													const n8nApiKey = n8nApi.apiKey as string;

													// List all credentials to find matching phoneNumber
													const listCredentialsUrl = `${n8nApiUrl}/api/v1/credentials`;
													console.error(`Listing credentials at ${listCredentialsUrl}`);

													const listResponse = await axios.get(listCredentialsUrl, {
														headers: {
															'Content-Type': 'application/json',
															'X-N8N-API-KEY': n8nApiKey as string
														},
													});

													const allCredentials = listResponse.data.data || [];
													console.error(`Found ${allCredentials.length} credentials`);

													// Find credential with matching phoneNumber
													let existingCredential = null;
													if (phoneNumber) {
														existingCredential = allCredentials.find((cred: any) => {
															return cred.type === 'zaloApi' && 
																   cred.data && 
																   cred.data.phoneNumber === phoneNumber;
														});
													}

													if (existingCredential) {
														console.error(`Found existing credential with phoneNumber ${phoneNumber}, updating...`);
														
														// Giữ nguyên proxy từ credential cũ nếu có
														const existingProxy = existingCredential.data?.proxy || '';
														const finalProxy = existingProxy || proxy || '';
														console.error(`Keeping existing proxy: ${existingProxy || 'none'}, using: ${finalProxy}`);
														
														// Tạo credentialData với proxy từ credential cũ
														const credentialData = {
															cookie: JSON.stringify(cookie),
															imei: imei,
															userAgent: userAgent,
															proxy: finalProxy, // Giữ nguyên proxy cũ
															name: userName,
															phoneNumber: phoneNumber,
															userId: userId
														};
														
														// Update existing credential - update cả name và data
														const updateUrl = `${n8nApiUrl}/api/v1/credentials/${existingCredential.id}`;
														console.error(`Updating credential at ${updateUrl}`);
														console.error(`Update payload:`, JSON.stringify({
															name: credentialName,
															data: credentialData
														}, null, 2));

														try {
															// Thử PATCH trước
															await axios.patch(updateUrl, {
																name: credentialName, // Update tên credential
																data: credentialData
															}, {
																headers: {
																	'Content-Type': 'application/json',
																	'X-N8N-API-KEY': n8nApiKey as string
																},
															});

															console.error('Credential updated successfully via n8n API (PATCH)');
															console.error(`Credential ID: ${existingCredential.id}`);
															console.error(`Credential name updated to: ${credentialName}`);
														} catch (patchError: any) {
															console.error(`PATCH failed: ${patchError.message}`);
															if (patchError.response) {
																console.error(`PATCH response status: ${patchError.response.status}`);
																console.error(`PATCH response data:`, JSON.stringify(patchError.response.data));
															}
															
															// Thử PUT nếu PATCH không hỗ trợ
															console.error('Trying PUT method instead...');
															await axios.put(updateUrl, {
																name: credentialName,
																type: 'zaloApi',
																nodesAccess: existingCredential.nodesAccess || [],
																data: credentialData
															}, {
																headers: {
																	'Content-Type': 'application/json',
																	'X-N8N-API-KEY': n8nApiKey as string
																},
															});

															console.error('Credential updated successfully via n8n API (PUT)');
															console.error(`Credential ID: ${existingCredential.id}`);
															console.error(`Credential name updated to: ${credentialName}`);
														}
													} else {
														console.error(`No existing credential found with phoneNumber ${phoneNumber}, creating new one...`);
														
														// Tạo credentialData mới với proxy từ node parameter
														const credentialData = {
															cookie: JSON.stringify(cookie),
															imei: imei,
															userAgent: userAgent,
															proxy: proxy || '',
															name: userName,
															phoneNumber: phoneNumber,
															userId: userId
														};
														
														// Create new credential if not found
														const createUrl = `${n8nApiUrl}/api/v1/credentials`;
														await axios.post(createUrl, {
															name: credentialName,
															type: 'zaloApi',
															nodesAccess: [],
															data: credentialData
														}, {
															headers: {
																'Content-Type': 'application/json',
																'X-N8N-API-KEY': n8nApiKey as string
															},
														});

														console.error('New credential created successfully via n8n API');
													}
												} catch (error: any) {
													console.error(`Error updating/creating credential: ${error.message}`);
													if (error.response) {
														console.error('Response data:', JSON.stringify(error.response.data));
													}
												}
											} else {
												console.error('=== NO CREDENTIALS TO SAVE ===');
												console.error('No login information available to save');
											}
										} catch (fileError: any) {
											console.error('Error saving credentials:', fileError.message);
										}
									})().catch((error) => {
										console.error('Error in async credential saving:', error);
									});
								}
								break;

							default:
								console.error('Unknown QR event type:', qrEvent.type);
						}
					});

					// Start the listener immediately to capture all events
					console.error('Starting Zalo listener');
					api.listener.start();

					// Set up event listeners after getting the API
					api.listener.onConnected(() => {
						console.error("=== ZALO SDK CONNECTED ===");
						// Get context after successful connection
						setupEventListeners(api);
					});

					// Listen for errors
					api.listener.onError((error: any) => {
						console.error("=== ZALO ERROR ===", error);
					});

					// Listen for messages (might contain login information)
					api.listener.onMessage((message: any) => {
						console.error("=== ZALO MESSAGE RECEIVED ===");
						console.error("Message type:", message.type);
						console.error("Message content:", JSON.stringify(message).substring(0, 200) + '...');

						// Check if this is a login confirmation message
						if (message.type === 'login_success' || message.type === 'qr_scanned') {
							console.error("=== QR CODE SCANNED OR LOGIN SUCCESSFUL ===");
							setupEventListeners(api);
						}
					});

					console.error('All event listeners set up');
				} catch (error: any) {
					// Clear timeout
					clearTimeout(timeoutId);

					if (!isResolved) {
						isResolved = true;
						reject(error);
					}
				}
			});

			// Wait for QR code to be generated
			const qrCodeBase64 = await qrCodePromise;

			// Create a binary buffer from the base64 string
			const binaryData = Buffer.from(qrCodeBase64, 'base64');

			// Create a new item with the QR code as binary data
			const newItem: INodeExecutionData = {
				json: {
					success: true,
					message: selectedCredential === n8nCredential
						? 'Using n8n account credential. QR code generated successfully.'
						: (selectedCredential === zaloCredential
							? 'Using existing Zalo credentials. QR code generated successfully.'
							: 'QR code generated successfully. Scan with Zalo app to login.'),
					fileName,
					usingExistingCredential: !!selectedCredential,
					credentialType: selectedCredential === n8nCredential ? 'n8nZaloApi' : (selectedCredential === zaloCredential ? 'zaloApi' : null),
				},
				binary: {
					data: await this.helpers.prepareBinaryData(binaryData, fileName, 'image/png'),
				},
			};

			returnData.push(newItem);

			// Add credential creation instructions to the output
			if (returnData[0] && returnData[0].json) {
				if (!selectedCredential) {
					returnData[0].json.credentialInstructions = 'Credentials will be updated automatically if matching phoneNumber found, otherwise new credential will be created.';
				} else if (selectedCredential === n8nCredential) {
					returnData[0].json.credentialInstructions = 'Using n8n account credential. Existing Zalo credentials will be updated after successful login.';
					returnData[0].json.credentialName = selectedCredential.name || 'Unknown';
					returnData[0].json.credentialId = selectedCredential.id || 'Unknown';
					returnData[0].json.credentialType = 'n8nZaloApi';
				} else {
					returnData[0].json.credentialInstructions = 'Using existing Zalo credentials from the selected credential.';
					returnData[0].json.credentialName = selectedCredential.name || 'Unknown';
					returnData[0].json.credentialId = selectedCredential.id || 'Unknown';
					returnData[0].json.credentialType = 'zaloApi';
				}
			}

			return [returnData];
		} catch (error: any) {
			if (this.continueOnFail()) {
				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray({ error: error.message }),
					{ itemData: { item: 0 } },
				);
				return [executionData];
			} else {
				throw error;
			}
		}
	}
}

