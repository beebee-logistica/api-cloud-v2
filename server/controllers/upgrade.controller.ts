import { Request } from 'express';
import * as request from 'request-promise';
import { IRancherAPIData, IServiceData, IServiceLinksData, IUpgradeData, IUpgradeRequestData } from '../models/interfaces';
import { UpgradeData } from '../models';


export class UpgradeController {

    private getBasicOptions ( req: Request ) {
        return {
            headers: {
                Authorization: req.get( 'Authorization' )
            },
            json: true
        };
    }

    public async upgradeService ( req: Request ): Promise<string> {
        const data: IUpgradeRequestData = req.body;
        const basicOptions = this.getBasicOptions( req );

        const rancherURL = 'http://cloud.datacenter.es.gov.br.local/v1/projects/';
        const rancherData: { data: IRancherAPIData[] } = await request( rancherURL, basicOptions );
        const envId = rancherData.data.find( d => d.name === data.environment && d.type === 'project' ).id;

        const envURL = `http://cloud.datacenter.es.gov.br.local/v1/projects/${envId}/environments`;
        const envData: { data: IRancherAPIData[] } = await request( envURL, basicOptions );
        const stackId = envData.data.find( d => d.name === data.stack && d.type === 'environment' ).id;

        const stackURL = `http://cloud.datacenter.es.gov.br.local/v1/projects/${envId}/environments/${stackId}/services`;
        const stackData: { data: IServiceData[] } = await request( stackURL, basicOptions );
        const service = stackData.data.find( d => d.name === data.service && d.type === 'service' );

        const serviceLinksURL = `http://cloud.datacenter.es.gov.br.local/v1/serviceconsumemaps?serviceId=${service.id}`;
        const serviceLinksData: { data: IServiceLinksData[] } = await request( serviceLinksURL, basicOptions );
        const serviceLinks = serviceLinksData.data.map( sl => ( {
            name: sl.name,
            serviceId: sl.consumedServiceId
        } ) );

        const upgradeURL = `http://cloud.datacenter.es.gov.br.local/v1/services/${service.id}/?action=upgrade`;
        const upgradeBody: { inServiceStrategy: IUpgradeData } = {
            inServiceStrategy: new UpgradeData( {
                batchSize: data.batchSize,
                intervalMillis: data.interval,
                launchConfig: service.launchConfig,
                secondaryLaunchConfigs: service.secondaryLaunchConfigs,
                startFirst: data.startFirst
            } )
        };
        upgradeBody.inServiceStrategy.launchConfig.containerImageName = data.image || service.launchConfig.containerImageName;

        await request( upgradeURL, Object.assign( {
            method: 'POST',
            body: upgradeBody
        }, basicOptions ) );

        const setServiceLinksURL = `http://cloud.datacenter.es.gov.br.local/v1/services/${service.id}/?action=setservicelinks`;
        const setServiceLinksBody: { serviceLinks: any[] } = {
            serviceLinks: serviceLinks
        };
        await request( setServiceLinksURL, Object.assign( {
            method: 'POST',
            body: setServiceLinksBody
        }, basicOptions ) );

        return service.id;
    }

    public async finishUpgrade ( req: Request, serviceId: string ): Promise<any> {
        const basicOptions = this.getBasicOptions( req );

        const serviceURL = `http://cloud.datacenter.es.gov.br.local/v1/services/${serviceId}`;
        const serviceData: IServiceData = await request( serviceURL, basicOptions );

        if ( serviceData.state === 'upgraded' ) {
            const finishUpgradeURL = `http://cloud.datacenter.es.gov.br.local/v1/services/${serviceId}/?action=finishupgrade`;
            await request( finishUpgradeURL, Object.assign( { method: 'POST' }, basicOptions ) );
            return 'ok';
        }

        return serviceData;
    }
}