import { create, ShapeDiverRequestSdtfUploadPartType, ShapeDiverResponseOutput, ShapeDiverSdkApiResponseType } from "@shapediver/sdk.geometry-api-sdk-v2"
import { guessMimeTypeFromFilename } from "@shapediver/viewer.utils.mime-type";
import * as fs from 'fs/promises';
 


interface ConvertOptions {
    /** Path to sdTF file */
    filepathIn: string
    /** Path to output glTF file */
    filepathOut: string
    /** ShapeDiver model view URL for the sdTF to glTF converter model */
    modelViewUrl: string
    /** ShapeDiver backend ticket for the sdTF to glTF converter model */
    ticket: string
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

    // create session
    const sdk = create(modelViewUrl);
    const sessionDto = await sdk.session.init(ticket);
    const sessionId = sessionDto.sessionId!;

    // get all s-type parameters
    const sdtfParams = Object.values(sessionDto.parameters!).filter(p => p.type.startsWith('s'));
    if (sdtfParams.length === 0) {
        throw new Error(`Could not find and s-type parameters`);
    }
    
    // read file from disk (filepath)
    const fileContents = await fs.readFile(filepathIn);
    const fileSize = Buffer.byteLength(fileContents);

    // request upload url
    const uploadResponse = await sdk.sdtf.requestUpload(sessionId, [{
        content_type: ShapeDiverRequestSdtfUploadPartType.MODEL_SDTF, 
        content_length: fileSize, 
        namespace: 'pub'
    }]);
    const uploadDto = uploadResponse.asset!.sdtf![0];

    // upload file to url
    await sdk.utils.upload(uploadDto.href, fileContents, mimeType);

    // prepare parameter data
    const requestBody: { [key: string]: string } = {};
    sdtfParams.forEach(p => {
        requestBody[p.id] = uploadDto.id;
    });

    // run computation
    const computationResponse = await sdk.utils.submitAndWaitForCustomization(sdk, sessionId, requestBody);

    // get resulting glTF url
    const outputResult = Object.values(computationResponse.outputs!).find(o => {
        const output = (o as ShapeDiverResponseOutput);
        return output.status_computation === 'success' && output.content!.some(c => c.contentType === 'model/gltf-binary');
    }) as ShapeDiverResponseOutput;
    if (!outputResult) {
        console.debug(JSON.stringify(computationResponse.outputs, null, 2));
        throw new Error('No resulting glTF file found');
    }
    const item = outputResult.content!.find(c => c.contentType === 'model/gltf-binary');

    // download glTF file into buffer
    const buffer = (await sdk.utils.download(item!.href!, ShapeDiverSdkApiResponseType.DATA))[1];
    
    // Write buffer to file at filepathOut
    await fs.writeFile(filepathOut, new DataView(buffer));
}

