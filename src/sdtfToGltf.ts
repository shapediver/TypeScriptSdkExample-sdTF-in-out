import {
    Configuration,
    ReqSdtfType,
    ResOutput,
    SdtfApi,
    SessionApi,
    UtilsApi,
} from '@shapediver/sdk.geometry-api-sdk-v2';
import { guessMimeTypeFromFilename } from '@shapediver/viewer.utils.mime-type';
import * as fs from 'fs/promises';

interface ConvertOptions {
    /** Path to sdTF file */
    filepathIn: string;
    /** Path to output glTF file */
    filepathOut: string;
    /** ShapeDiver model view URL for the sdTF to glTF converter model */
    modelViewUrl: string;
    /** ShapeDiver backend ticket for the sdTF to glTF converter model */
    ticket: string;
}

/**
 * Convert an sdTF file to glTF using ShapeDiver
 * See the Grasshopper file `sdTF-to-glTF.ghx` for an example converter model.
 * @param options
 */
export async function sdtfToGltf(options: ConvertOptions): Promise<void> {
    const { filepathIn, filepathOut, modelViewUrl, ticket } = options;

    // guess mime type of file (must be 'model/vnd.sdtf)
    const mimeTypes = guessMimeTypeFromFilename(filepathIn);
    if (mimeTypes.length === 0) {
        throw new Error(`Could not determine mime type of file ${filepathIn}`);
    }
    const mimeType = mimeTypes[0];
    if (mimeType !== 'model/vnd.sdtf') {
        throw new Error(`Expected mime type 'model/vnd.sdtf' but got ${mimeType}`);
    }

    // create configuration object for SDK
    const config = new Configuration({ basePath: modelViewUrl });

    // create session
    const sessionDto = (await new SessionApi(config).createSessionByTicket(ticket)).data;
    const sessionId = sessionDto.sessionId;

    // get all s-type parameters
    const sdtfParams = Object.values(sessionDto.parameters!).filter((p) => p.type.startsWith('s'));
    if (sdtfParams.length === 0) {
        throw new Error(`Could not find and s-type parameters`);
    }

    // read file from disk (filepath)
    const fileContents = await fs.readFile(filepathIn);
    const fileSize = Buffer.byteLength(fileContents);

    // request upload url
    const uploadResponse = await new SdtfApi(config).uploadSdtf(sessionId, [
        {
            content_type: ReqSdtfType.MODEL_SDTF,
            content_length: fileSize,
            namespace: 'pub',
        },
    ]);
    const uploadDto = uploadResponse.data.asset!.sdtf![0];

    // upload file to url
    await new UtilsApi().uploadAsset(uploadDto.href, fileContents, uploadDto.headers);

    // prepare parameter data
    const requestBody: { [key: string]: string } = {};
    sdtfParams.forEach((p) => {
        requestBody[p.id] = uploadDto.id;
    });

    // run computation
    const computationResponse = await new UtilsApi(config).submitAndWaitForOutput(
        sessionId,
        requestBody
    );

    // get resulting glTF url
    const outputResult = Object.values(computationResponse.outputs!).find((o) => {
        const output = o as ResOutput;
        return (
            output.status_computation === 'success' &&
            output.content!.some((c) => c.contentType === 'model/gltf-binary')
        );
    }) as ResOutput;
    if (!outputResult) {
        console.debug(JSON.stringify(computationResponse.outputs, null, 2));
        throw new Error('No resulting glTF file found');
    }
    const item = outputResult.content!.find((c) => c.contentType === 'model/gltf-binary');

    // download glTF file into buffer (Axios returns a string in Node.js applications)
    const gltf = (await new UtilsApi().download(item!.href!, { responseType: 'arraybuffer' }))
        .data as unknown as Buffer;

    // Write buffer to file at filepathOut
    await fs.writeFile(filepathOut, new DataView(gltf.buffer, gltf.byteOffset, gltf.byteLength));

    // close session
    await new SessionApi(config).closeSession(sessionId);
}
