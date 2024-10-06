import { create, ShapeDiverResponseOutput, ShapeDiverSdkApiResponseType } from "@shapediver/sdk.geometry-api-sdk-v2"
import { guessMimeTypeFromFilename } from "@shapediver/viewer.utils.mime-type";
import * as fs from 'fs/promises';
 


interface ConvertOptions {
    /** Path to CAD file */
    filepathIn: string
    /** Path to output sdTF file */
    filepathOut: string
    /** ShapeDiver model view URL for the CAD to sdTF converter model */
    modelViewUrl: string
    /** ShapeDiver backend ticket for the CAD to sdTF converter model */
    ticket: string
}

/**
 * Convert a CAD file to sdTF using ShapeDiver. 
 * See the Grasshopper file `CAD-to-sdTF.ghx` for an example converter model. 
 * @param options 
 */
export async function cadToSdtf(options: ConvertOptions): Promise<void> {
    const { filepathIn, filepathOut, modelViewUrl, ticket } = options;

    // guess mime type of file
    const mimeTypes = guessMimeTypeFromFilename(filepathIn);
    if (mimeTypes.length === 0) {
        throw new Error(`Could not determine mime type of file ${filepathIn}`);
    }
    const mimeType = mimeTypes[0];
    
    // create session
    const sdk = create(modelViewUrl);
    const sessionDto = await sdk.session.init(ticket);
    const sessionId = sessionDto.sessionId!;

    // get parameter of type "File"
    const fileParam = Object.values(sessionDto.parameters!).find(p => p.type === 'File' && p.format!.includes(mimeType));
    if (!fileParam) {
        throw new Error(`Could not find file parameter that supports mime type ${mimeType}`);
    }
    
    // read file from disk (filepath)
    const fileContents = await fs.readFile(filepathIn);
    const fileSize = Buffer.byteLength(fileContents);

    // request upload url
    const uploadResponse = await sdk.file.requestUpload(sessionId, { [fileParam.id]: {format: mimeType, size: fileSize}} );
    const uploadDto = uploadResponse.asset!.file![fileParam.id];

    // upload file to url
    await sdk.utils.upload(uploadDto.href, fileContents, mimeType);

    // run computation
    const computationResponse = await sdk.utils.submitAndWaitForCustomization(sdk, sessionId, { [fileParam.id]: uploadDto.id });

    // get resulting sdTF url
    const outputResult = Object.values(computationResponse.outputs!).find(o => {
        const output = (o as ShapeDiverResponseOutput);
        return output.status_computation === 'success' && output.content!.some(c => c.format === 'sdtf');
    }) as ShapeDiverResponseOutput;
    if (!outputResult) {
        console.debug(JSON.stringify(computationResponse.outputs, null, 2));
        throw new Error('No resulting sdTF file found');
    }
    const item = outputResult.content!.find(c => c.format === 'sdtf');

    // download glTF file into buffer
    const buffer = (await sdk.utils.download(item!.href!, ShapeDiverSdkApiResponseType.DATA))[1];
    
    // Write buffer to file at filepathOut
    await fs.writeFile(filepathOut, new DataView(buffer));
}

